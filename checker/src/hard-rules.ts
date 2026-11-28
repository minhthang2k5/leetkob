import Parser from 'web-tree-sitter';
import type { CheckConstraint, CheckVerdict, EvidenceLine } from '@leetkob/shared';
import { bannedNames } from './classify';
import { splitLines, stripCommentsKeepLines } from './preprocess';

type SyntaxNode = Parser.SyntaxNode;

let languagePromise: Promise<Parser.Language> | null = null;

function getCppLanguage(): Promise<Parser.Language> {
  languagePromise ??= (async () => {
    await Parser.init();
    const wasmPath = require.resolve('tree-sitter-wasms/out/tree-sitter-cpp.wasm');
    return Parser.Language.load(wasmPath);
  })();
  return languagePromise;
}

interface ParsedBanTarget {
  raw: string;
  namespacePrefix: string | null;
  identifier: string;
}

function parseBanTarget(name: string): ParsedBanTarget {
  const parenIdx = name.indexOf('(');
  const cleaned = (parenIdx === -1 ? name : name.slice(0, parenIdx)).trim();
  const idx = cleaned.lastIndexOf('::');
  if (idx === -1) {
    return { raw: name, namespacePrefix: null, identifier: cleaned };
  }
  const ns = cleaned.slice(0, idx).replace(/^::/, '');
  const ident = cleaned.slice(idx + 2);
  return { raw: name, namespacePrefix: ns || null, identifier: ident };
}

const KEYWORD_NODE_MAP: Record<string, string[]> = {
  for: ['for_statement', 'for_range_loop'],
  while: ['while_statement'],
  do: ['do_statement'],
  goto: ['goto_statement']
};

interface FileContext {
  stdAliases: Set<string>;
  usingNamespaceStd: boolean;
  usingStdDecls: Set<string>;
  userDefinedFunctions: Set<string>;
  userDefinedTypes: Set<string>;
  macroAliases: Map<string, string>;
}

function extractDeclaratorName(node: SyntaxNode | null): string | null {
  if (!node) return null;
  if (node.type === 'identifier' || node.type === 'type_identifier') {
    return node.text;
  }
  const inner = node.childForFieldName('declarator');
  return inner ? extractDeclaratorName(inner) : null;
}

function isInsideClassOrStruct(node: SyntaxNode): boolean {
  let cur = node.parent;
  while (cur) {
    if (cur.type === 'class_specifier' || cur.type === 'struct_specifier') {
      return true;
    }
    cur = cur.parent;
  }
  return false;
}

function isInsideUsingDeclaration(node: SyntaxNode): boolean {
  let cur = node.parent;
  while (cur) {
    if (cur.type === 'using_declaration') return true;
    cur = cur.parent;
  }
  return false;
}

function walk(node: SyntaxNode, visitor: (n: SyntaxNode) => void): void {
  visitor(node);
  for (const child of node.namedChildren) {
    walk(child, visitor);
  }
}

function getQualifiedParts(node: SyntaxNode): { scope: string; name: string } | null {
  if (node.type !== 'qualified_identifier') return null;
  const scopeNode = node.childForFieldName('scope');
  const nameNode = node.childForFieldName('name');
  if (!nameNode) return null;
  const scopeText = scopeNode ? scopeNode.text.replace(/^::/, '') : '';
  const nameText =
    nameNode.type === 'template_function' || nameNode.type === 'template_type'
      ? (nameNode.childForFieldName('name')?.text ?? nameNode.text)
      : nameNode.text;
  return { scope: scopeText, name: nameText };
}

function collectPreprocDef(node: SyntaxNode, ctx: FileContext): void {
  const nameNode = node.childForFieldName('name');
  const valueNode = node.childForFieldName('value');
  if (nameNode && valueNode) {
    ctx.macroAliases.set(nameNode.text, valueNode.text);
  }
}

function collectNamespaceAlias(node: SyntaxNode, ctx: FileContext): void {
  const nameNode = node.childForFieldName('name');
  const targetNode = node.namedChildren[node.namedChildren.length - 1];
  if (nameNode && targetNode && ctx.stdAliases.has(targetNode.text.replace(/^::/, ''))) {
    ctx.stdAliases.add(nameNode.text);
  }
}

function collectUsingDeclaration(node: SyntaxNode, ctx: FileContext): void {
  if (node.children.some((c) => c.type === 'namespace')) {
    const nsNode = node.namedChildren[0];
    if (nsNode && ctx.stdAliases.has(nsNode.text.replace(/^::/, ''))) {
      ctx.usingNamespaceStd = true;
    }
    return;
  }
  const qNode = node.namedChildren.find((c) => c.type === 'qualified_identifier');
  const parts = qNode ? getQualifiedParts(qNode) : null;
  if (parts && ctx.stdAliases.has(parts.scope)) {
    ctx.usingStdDecls.add(parts.name);
  }
}

function collectFunctionDef(node: SyntaxNode, ctx: FileContext): void {
  if (isInsideClassOrStruct(node)) return;
  const decl = node.childForFieldName('declarator');
  if (decl?.type !== 'function_declarator') return;
  const inner = decl.childForFieldName('declarator');
  const fnName = extractDeclaratorName(inner);
  if (fnName && !inner?.text.includes('::')) {
    ctx.userDefinedFunctions.add(fnName);
  }
}

function collectTypeDef(node: SyntaxNode, ctx: FileContext): void {
  if (isInsideClassOrStruct(node)) return;
  const typeName = node.childForFieldName('name')?.text;
  if (typeName) ctx.userDefinedTypes.add(typeName);
}

function collectFileContext(root: SyntaxNode): FileContext {
  const ctx: FileContext = {
    stdAliases: new Set<string>(['std']),
    usingNamespaceStd: false,
    usingStdDecls: new Set<string>(),
    userDefinedFunctions: new Set<string>(),
    userDefinedTypes: new Set<string>(),
    macroAliases: new Map<string, string>()
  };

  walk(root, (node) => {
    if (node.type === 'preproc_def' || node.type === 'preproc_function_def') {
      collectPreprocDef(node, ctx);
    } else if (node.type === 'namespace_alias_definition') {
      collectNamespaceAlias(node, ctx);
    } else if (node.type === 'using_declaration') {
      collectUsingDeclaration(node, ctx);
    } else if (node.type === 'function_definition') {
      collectFunctionDef(node, ctx);
    } else if (node.type === 'struct_specifier' || node.type === 'class_specifier') {
      collectTypeDef(node, ctx);
    }
  });

  return ctx;
}

function escapeRegExp(s: string): string {
  return s.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
}

function macroExpandsToTarget(
  macroBody: string,
  target: ParsedBanTarget,
  ctx: FileContext
): boolean {
  const escapedIdent = escapeRegExp(target.identifier);
  const identRe = new RegExp(String.raw`\b${escapedIdent}\b`);
  if (!identRe.test(macroBody)) return false;
  if (target.namespacePrefix !== 'std') return true;

  const stdPattern = [...ctx.stdAliases].map(escapeRegExp).join('|');
  const qualifiedRe = new RegExp(
    String.raw`\b(?:${stdPattern})\s*::\s*${escapedIdent}\b`
  );
  return (
    qualifiedRe.test(macroBody) ||
    ctx.usingNamespaceStd ||
    ctx.usingStdDecls.has(target.identifier)
  );
}

type RecordFn = (node: SyntaxNode, target: ParsedBanTarget) => void;

function isImportedStdSymbol(
  name: string,
  userDefined: Set<string>,
  ctx: FileContext
): boolean {
  return ctx.usingStdDecls.has(name) || (ctx.usingNamespaceStd && !userDefined.has(name));
}

function checkKeywordNode(
  node: SyntaxNode,
  targets: ParsedBanTarget[],
  record: RecordFn
): void {
  for (const target of targets) {
    if (
      target.namespacePrefix === null &&
      KEYWORD_NODE_MAP[target.identifier]?.includes(node.type)
    ) {
      record(node, target);
    }
  }
}

function checkMacroNode(
  node: SyntaxNode,
  ctx: FileContext,
  targets: ParsedBanTarget[],
  record: RecordFn
): void {
  if (
    node.type !== 'identifier' ||
    node.parent?.type === 'preproc_def' ||
    node.parent?.type === 'preproc_function_def'
  ) {
    return;
  }
  const macroBody = ctx.macroAliases.get(node.text);
  if (!macroBody) return;
  for (const target of targets) {
    if (macroExpandsToTarget(macroBody, target, ctx)) {
      record(node, target);
    }
  }
}

function checkQualifiedNode(
  node: SyntaxNode,
  ctx: FileContext,
  targets: ParsedBanTarget[],
  record: RecordFn
): void {
  if (isInsideUsingDeclaration(node)) return;
  const parts = getQualifiedParts(node);
  if (!parts) return;
  for (const target of targets) {
    if (parts.name !== target.identifier) continue;
    const isStdTarget =
      target.namespacePrefix === 'std' || target.namespacePrefix === null;
    if (
      isStdTarget
        ? ctx.stdAliases.has(parts.scope)
        : parts.scope === target.namespacePrefix
    ) {
      record(node, target);
    }
  }
}

function matchesUnqualifiedTarget(
  name: string,
  target: ParsedBanTarget,
  userDefined: Set<string>,
  ctx: FileContext
): boolean {
  if (name !== target.identifier) return false;
  if (target.namespacePrefix === null) {
    return !userDefined.has(name);
  }
  if (target.namespacePrefix === 'std') {
    return isImportedStdSymbol(name, userDefined, ctx);
  }
  return false;
}

function checkFieldCallNode(
  fnNode: SyntaxNode,
  callNode: SyntaxNode,
  targets: ParsedBanTarget[],
  record: RecordFn
): void {
  const fieldName = fnNode.childForFieldName('field')?.text;
  if (!fieldName) return;
  for (const target of targets) {
    if (target.namespacePrefix === null && fieldName === target.identifier) {
      record(callNode, target);
    }
  }
}

function checkCallNode(
  node: SyntaxNode,
  ctx: FileContext,
  targets: ParsedBanTarget[],
  record: RecordFn
): void {
  const fnNode = node.childForFieldName('function');
  if (!fnNode) return;

  if (fnNode.type === 'field_expression') {
    checkFieldCallNode(fnNode, node, targets, record);
    return;
  }

  if (fnNode.type !== 'identifier' && fnNode.type !== 'template_function') return;
  const fnName =
    fnNode.type === 'template_function'
      ? (fnNode.childForFieldName('name')?.text ?? '')
      : fnNode.text;

  for (const target of targets) {
    if (matchesUnqualifiedTarget(fnName, target, ctx.userDefinedFunctions, ctx)) {
      record(node, target);
    }
  }
}

function checkTypeNode(
  node: SyntaxNode,
  ctx: FileContext,
  targets: ParsedBanTarget[],
  record: RecordFn
): void {
  if (node.parent?.type === 'qualified_identifier') return;
  const isTypeDeclName =
    (node.parent?.type === 'struct_specifier' ||
      node.parent?.type === 'class_specifier') &&
    node.parent.childForFieldName('name')?.id === node.id;
  if (isTypeDeclName) return;

  const typeName = node.text;
  for (const target of targets) {
    if (matchesUnqualifiedTarget(typeName, target, ctx.userDefinedTypes, ctx)) {
      record(node, target);
    }
  }
}

function findViolationsInAst(
  root: SyntaxNode,
  ctx: FileContext,
  targets: ParsedBanTarget[],
  originalLines: string[]
): { evidence: EvidenceLine[]; matchedNames: string[] } {
  const matchedLines = new Set<number>();
  const matchedNames = new Set<string>();

  const record: RecordFn = (node, target) => {
    matchedLines.add(node.startPosition.row + 1);
    matchedNames.add(target.raw);
  };

  walk(root, (node) => {
    checkKeywordNode(node, targets, record);
    checkMacroNode(node, ctx, targets, record);
    if (node.type === 'qualified_identifier') {
      checkQualifiedNode(node, ctx, targets, record);
    } else if (node.type === 'call_expression') {
      checkCallNode(node, ctx, targets, record);
    } else if (node.type === 'type_identifier') {
      checkTypeNode(node, ctx, targets, record);
    }
  });

  const evidence: EvidenceLine[] = [...matchedLines]
    .sort((a, b) => a - b)
    .map((line) => ({
      line,
      text: (originalLines[line - 1] ?? '').trim()
    }));

  return { evidence, matchedNames: [...matchedNames] };
}

/**
 * Evaluates a batch of `BAN_LIST` constraints against C++ source code using one AST parse.
 */
export async function evaluateHardRules(
  constraints: CheckConstraint[],
  originalCode: string,
  strippedCode?: string
): Promise<CheckVerdict[]> {
  if (constraints.length === 0) return [];

  const cleaned = strippedCode ?? stripCommentsKeepLines(originalCode);
  const originalLines = splitLines(originalCode);

  const language = await getCppLanguage();
  const parser = new Parser();
  parser.setLanguage(language);
  const tree = parser.parse(cleaned);
  const ctx = collectFileContext(tree.rootNode);

  return constraints.map((constraint) => {
    const targets = bannedNames(constraint.text).map(parseBanTarget);
    const { evidence, matchedNames } = findViolationsInAst(
      tree.rootNode,
      ctx,
      targets,
      originalLines
    );

    if (evidence.length > 0) {
      return {
        constraintId: constraint.id,
        constraintCode: constraint.code,
        verdict: 'VIOLATION',
        source: 'HARD_RULE',
        evidence,
        reason: `Banned identifier used: ${matchedNames.join(', ')}`
      };
    }

    return {
      constraintId: constraint.id,
      constraintCode: constraint.code,
      verdict: 'PASS',
      source: 'HARD_RULE',
      evidence: [],
      reason: null
    };
  });
}

/**
 * Evaluates a single `BAN_LIST` constraint against C++ source code.
 */
export async function checkHardRule(
  constraint: CheckConstraint,
  originalCode: string,
  strippedCode?: string
): Promise<CheckVerdict> {
  const [verdict] = await evaluateHardRules([constraint], originalCode, strippedCode);
  return verdict;
}

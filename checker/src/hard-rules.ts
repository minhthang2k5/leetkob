import Parser from 'web-tree-sitter';
import type { CheckConstraint, CheckVerdict, EvidenceLine } from '@leetkob/shared';
import { bannedNames } from './classify';
import { splitLines, stripCommentsKeepLines } from './preprocess';

type SyntaxNode = Parser.SyntaxNode;

let languagePromise: Promise<Parser.Language> | null = null;

function getCppLanguage(): Promise<Parser.Language> {
  if (!languagePromise) {
    languagePromise = (async () => {
      await Parser.init();
      const wasmPath = require.resolve('tree-sitter-wasms/out/tree-sitter-cpp.wasm');
      return Parser.Language.load(wasmPath);
    })();
  }
  return languagePromise;
}

interface ParsedBanTarget {
  raw: string;
  namespacePrefix: string | null;
  identifier: string;
}

function parseBanTarget(name: string): ParsedBanTarget {
  const cleaned = name.replace(/\(.*\)$/, '').trim();
  const idx = cleaned.lastIndexOf('::');
  if (idx === -1) {
    return { raw: name, namespacePrefix: null, identifier: cleaned };
  }
  const ns = cleaned.slice(0, idx).replace(/^::/, '');
  const ident = cleaned.slice(idx + 2);
  return { raw: name, namespacePrefix: ns || null, identifier: ident };
}

interface FileContext {
  stdAliases: Set<string>;
  usingNamespaceStd: boolean;
  usingStdDecls: Set<string>;
  userDefinedFunctions: Set<string>;
  userDefinedTypes: Set<string>;
}

function extractDeclaratorName(node: SyntaxNode | null): string | null {
  if (!node) return null;
  if (node.type === 'identifier' || node.type === 'type_identifier') {
    return node.text;
  }
  const inner = node.childForFieldName('declarator');
  if (inner) return extractDeclaratorName(inner);
  return null;
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

function collectFileContext(root: SyntaxNode): FileContext {
  const stdAliases = new Set<string>(['std']);
  let usingNamespaceStd = false;
  const usingStdDecls = new Set<string>();
  const userDefinedFunctions = new Set<string>();
  const userDefinedTypes = new Set<string>();

  walk(root, (node) => {
    if (node.type === 'namespace_alias_definition') {
      const nameNode = node.childForFieldName('name');
      // Target namespace is the last named child (after '=').
      const targetNode = node.namedChildren[node.namedChildren.length - 1];
      if (nameNode && targetNode) {
        const targetText = targetNode.text.replace(/^::/, '');
        if (stdAliases.has(targetText)) {
          stdAliases.add(nameNode.text);
        }
      }
    } else if (node.type === 'using_declaration') {
      const hasNamespaceKw = node.children.some((c) => c.type === 'namespace');
      if (hasNamespaceKw) {
        const nsNode = node.namedChildren[0];
        if (nsNode && stdAliases.has(nsNode.text.replace(/^::/, ''))) {
          usingNamespaceStd = true;
        }
      } else {
        const qNode = node.namedChildren.find((c) => c.type === 'qualified_identifier');
        if (qNode) {
          const parts = getQualifiedParts(qNode);
          if (parts && stdAliases.has(parts.scope)) {
            usingStdDecls.add(parts.name);
          }
        }
      }
    } else if (node.type === 'function_definition' && !isInsideClassOrStruct(node)) {
      const decl = node.childForFieldName('declarator');
      if (decl?.type === 'function_declarator') {
        const fnName = extractDeclaratorName(decl.childForFieldName('declarator'));
        if (fnName && !decl.childForFieldName('declarator')?.text.includes('::')) {
          userDefinedFunctions.add(fnName);
        }
      }
    } else if (
      (node.type === 'struct_specifier' || node.type === 'class_specifier') &&
      !isInsideClassOrStruct(node)
    ) {
      const typeName = node.childForFieldName('name')?.text;
      if (typeName) userDefinedTypes.add(typeName);
    }
  });

  return {
    stdAliases,
    usingNamespaceStd,
    usingStdDecls,
    userDefinedFunctions,
    userDefinedTypes
  };
}

function findViolationsInAst(
  root: SyntaxNode,
  ctx: FileContext,
  targets: ParsedBanTarget[],
  originalLines: string[]
): { evidence: EvidenceLine[]; matchedNames: string[] } {
  const matchedLines = new Set<number>();
  const matchedNames = new Set<string>();

  const record = (node: SyntaxNode, target: ParsedBanTarget) => {
    matchedLines.add(node.startPosition.row + 1);
    matchedNames.add(target.raw);
  };

  walk(root, (node) => {
    // 1. Qualified identifiers like `std::sort`, `s::sort`, `std::map`
    if (node.type === 'qualified_identifier' && !isInsideUsingDeclaration(node)) {
      const parts = getQualifiedParts(node);
      if (!parts) return;
      for (const target of targets) {
        if (parts.name !== target.identifier) continue;
        if (target.namespacePrefix === 'std' || target.namespacePrefix === null) {
          if (ctx.stdAliases.has(parts.scope)) {
            record(node, target);
          }
        } else if (parts.scope === target.namespacePrefix) {
          record(node, target);
        }
      }
      return;
    }

    // 2. Unqualified calls: `sort(...)` or `qsort(...)`
    if (node.type === 'call_expression') {
      const fnNode = node.childForFieldName('function');
      if (!fnNode) return;
      // Ignore member calls like `obj.sort()` or `ptr->sort()` and qualified calls (handled above).
      if (fnNode.type === 'identifier' || fnNode.type === 'template_function') {
        const fnName =
          fnNode.type === 'template_function'
            ? (fnNode.childForFieldName('name')?.text ?? '')
            : fnNode.text;
        for (const target of targets) {
          if (fnName !== target.identifier) continue;
          if (target.namespacePrefix === null) {
            if (!ctx.userDefinedFunctions.has(fnName)) {
              record(node, target);
            }
          } else if (target.namespacePrefix === 'std') {
            const importedExplicitly = ctx.usingStdDecls.has(fnName);
            const importedViaStd =
              ctx.usingNamespaceStd && !ctx.userDefinedFunctions.has(fnName);
            if (importedExplicitly || importedViaStd) {
              record(node, target);
            }
          }
        }
      }
      return;
    }

    // 3. Unqualified type usage when `using namespace std;` or `using std::<type>;` is active
    if (node.type === 'type_identifier') {
      // Skip if this type_identifier is already part of a qualified_identifier (e.g. `my::vector`)
      if (node.parent?.type === 'qualified_identifier') return;
      // Skip struct/class definition names themselves
      if (
        (node.parent?.type === 'struct_specifier' ||
          node.parent?.type === 'class_specifier') &&
        node.parent.childForFieldName('name')?.id === node.id
      ) {
        return;
      }

      const typeName = node.text;
      for (const target of targets) {
        if (typeName !== target.identifier) continue;
        if (target.namespacePrefix === null) {
          if (!ctx.userDefinedTypes.has(typeName)) {
            record(node, target);
          }
        } else if (target.namespacePrefix === 'std') {
          const importedExplicitly = ctx.usingStdDecls.has(typeName);
          const importedViaStd =
            ctx.usingNamespaceStd && !ctx.userDefinedTypes.has(typeName);
          if (importedExplicitly || importedViaStd) {
            record(node, target);
          }
        }
      }
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

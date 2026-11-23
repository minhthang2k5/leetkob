# Student submission fixtures

These are complete C++17 attempts at the tasks below. They are independent of the lecturer's dev set. Each task has two accepted implementations, two deterministic logic mistakes, one compile mistake and one runtime mistake: 36 baseline submissions. Three additional attempts cover resource mistakes.

## Problems

| Task | Input | Required output |
|---|---|---|
| statistics | n = 1..1000, followed by n integers in -1e9..1e9 | Sum and maximum, separated by one space |
| sorting | n = 1..1000, followed by n integers in -1000..1000 | All values ascending on one line, with duplicates preserved |
| binary-search | n,q = 1..1000; n nondecreasing integers in -1e9..1e9; q query integers in that range | First zero-based index for each query, or -1, one answer per line |
| reverse-line | One ASCII line, length 0..1000, including spaces | The reversed line |
| dynamic-array | n = 1..10000, followed by n integers in -1000..1000 | Sum and minimum, separated by one space |
| gcd | Two integers a,b in 0..1e9 | Greatest common divisor; gcd(0,0) = 0 |

Every output ends with a newline. Judge whitespace handling follows contract A.1; it does not tokenize output. Algorithm/container bans do not apply to these sandbox-only tasks: checker conformance is a different responsibility.

## Why the wrong attempts fail

| Task | Wrong answer mistakes | Compile mistake | Runtime mistake |
|---|---|---|---|
| statistics | Initializes max to zero; sums absolute values instead of signed values | Renames the total but prints the old name | Confuses vector reserve with resize |
| sorting | Removes duplicates; excludes the last element from the sort range | Uses an old container name | Prints through index n using checked access |
| binary-search | Finds the last duplicate; uses n-2 as the initial inclusive upper bound | Missing declaration semicolon | Reads lower_bound's end position without an end check |
| reverse-line | Reads a token instead of a line; starts reversal at size-2 | Calls a renamed function by its old name | Starts checked access at size(), one past the last character |
| dynamic-array | Drops an element on resize; initializes minimum to zero | Deletes a buffer using an old identifier | Reserves storage without creating elements |
| gcd | Stops after one Euclid step; handles zero inputs incorrectly | Uses an undefined helper name | Computes a%b before guarding b=0 |

Checked access is used where a predictable runtime failure is needed: the suite does not assume arbitrary undefined behavior always segfaults. Several wrong attempts pass an initial test and fail a later edge case; tests verify the judge does not accept them merely because the sample passed.

Resource attempts are a bubble sort that forgets to reset its swapped flag, a sort that leaves full-array debug printing inside the inner loop, and an array implementation that mistakenly allocates n*n elements. They use the same task formats and valid input bounds as the normal attempts.

## Oracle and fixture policy

Reference calculations in TypeScript are independent of the submitted C++ implementations. Binary search is checked using linear indexOf; GCD cases have hand-checked constants. Small examples have explicit assertions. Larger arrays use deterministic arithmetic sequences, and the suite checks every input/expected output against the API's 64 KiB byte bounds.

Filename prefixes declare expected verdicts: accepted, wrong, compile, runtime. Resource cases are explicitly labelled in labs.ts. Changes to an expected label or test input must have a task/contract justification; never loosen a case in the implementation change that turns it green.

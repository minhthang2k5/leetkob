# Own Eval Cases (N2)

Custom test cases for LeeTKOB PA#3 covering `obvious`, `disguised`, `trap`, `injection`, and `style` scenarios:

- `custom-insertion/s01`: Obvious `std::sort` violation.
- `custom-insertion/s02`: Disguised `using std::stable_sort` violation.
- `custom-insertion/s03`: Trap — custom `my::sort` implementing insertion sort + `<algorithm>` included only for `std::swap`.
- `custom-insertion/s04`: Prompt-injection attempt inside comments and string literals on compliant insertion sort.
- `custom-insertion/s05`: Unusual style — recursive in-place insertion sort.
- `custom-insertion/s06`: Semantic violation — no banned library call, but allocates an auxiliary array and uses counting/copying instead of in-place insertion sort.

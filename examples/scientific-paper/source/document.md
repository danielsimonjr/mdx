# An Example Scientific Paper in MDZ Format

## Abstract

This is the abstract section. A real paper would summarize the
question, the method, the result, and the implication in 150–250
words. The MDZ format requires the Abstract section for archives
that declare the `scientific-paper-v1` profile.

## Introduction

This paper demonstrates the MDZ format as a single-file container
for peer-reviewable scientific papers ::cite[anthropic2026]. The
container bundles manuscript text, executable code cells, data,
figures, and a cryptographic signature chain into one ZIP-shaped
archive.

## Methods

We use a single illustrative dataset (`assets/data/series.csv`,
28 bytes; ::ref[fig-overview]) and a Python cell to re-compute
the headline statistic at view time. Reviewers re-run the cell
in any Pyodide-capable viewer.

::cell{language=python kernel=python3}

```python
import csv
with open("assets/data/series.csv") as f:
    rows = list(csv.DictReader(f))
mean_y = sum(int(r["y"]) for r in rows) / len(rows)
print(f"mean(y) = {mean_y}")
```

### Data collection

The data represent a tiny synthetic illustration; a real paper
would describe the actual collection protocol here.

## Results

::fig{id=fig-overview}

The headline result, computed inline (::ref[eq-mean]), is the
arithmetic mean of the synthetic `y` series. Re-execute the
cell above to verify.

::eq{id=eq-mean}

For a series $\{y_i\}_{i=1}^{n}$, the arithmetic mean is
$\bar y = \frac{1}{n}\sum_{i=1}^{n} y_i$.

::tab{id=tab-summary}

| Statistic | Value |
|-----------|-------|
| n         | 3     |
| mean(y)   | 4.0   |

## Discussion

Real papers discuss the implications of the result, threats to
validity, and links to related work ::cite[smith2020]. This
skeleton stops at acknowledging that the discussion section is
required by the profile.

## Acknowledgements

The MDZ Format Authors maintain the spec at <https://mdz-format.org>.

## References

::bibliography

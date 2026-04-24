# Cell with multiple outputs

::cell{language="python" kernel="python3" execution_count=7}
```python
import numpy as np
y = np.sin(np.linspace(0, 6.28, 100))
print(f"mean={y.mean():.4f}")
```

::output{type="text"}
```
mean=-0.0000
```

::output{type="image" mime="image/png" src="assets/images/sine.png"}

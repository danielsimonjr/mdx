# Unterminated fence inside a cell

::cell{language="python" kernel="python3"}
```python
x = 1
# no closing fence below — parser must raise ParseError, not absorb to EOF

More content that would otherwise be silently eaten.

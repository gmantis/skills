---
name: scientific-calculator
description: Evaluate scientific math expressions with functions like sin, cos, log, sqrt, etc. Trigger with `/calc <expression>` or `/calculator`
---

# Simple Scientific Calculator

Evaluates scientific and mathematical expressions with support for trigonometric, logarithmic, exponential, and power functions.

## Supported Functions

| Function | Example | Description |
|----------|---------|-------------|
| Basic | `2 + 3`, `10 - 4`, `5 * 6`, `20 / 4` | Arithmetic operations |
| Power | `2 ** 3`, `sqrt(16)` | Exponentiation and square root |
| Trig | `sin(1.57)`, `cos(0)`, `tan(0.785)` | Trigonometric (radians) |
| Trig Degrees | `sin(90, deg)`, `cos(180, deg)` | Trigonometric (degrees) |
| Logarithm | `log(100)`, `log10(1000)`, `ln(2.718)` | Base-e, base-10, natural log |
| Exponential | `exp(1)`, `e ** 2` | e^x calculations |
| Other | `abs(-5)`, `round(3.7)`, `factorial(5)` | Absolute, rounding, factorial |

## Usage

### Step 1 — Provide the Expression
Give Claude a math expression, optionally prefixed with `/calc`:

Examples:
```
/calc sin(pi/2) + cos(0)
sqrt(144) - 5 * 2
log10(1000) / ln(e)
2 ** 10
```

### Step 2 — Evaluation
Claude will:
1. Parse and validate the expression
2. Evaluate it using Python's `math` module
3. Display the result with 6 decimal precision
4. Show the original expression for clarity

## Special Constants

- `pi` — π (3.14159...)
- `e` — Euler's number (2.71828...)

## Tips

- Trigonometric functions use **radians** by default. For degrees, add `, deg` suffix: `sin(90, deg)`
- Use parentheses for clarity: `(5 + 3) * 2` vs `5 + 3 * 2`
- Expressions are evaluated left-to-right with standard operator precedence
- Results show up to 6 decimal places; request full precision if needed

## Examples

| Expression | Result |
|-----------|--------|
| `sqrt(2)` | 1.414214 |
| `sin(pi/2)` | 1.0 |
| `log10(100)` | 2.0 |
| `2 ** 8` | 256.0 |
| `factorial(5)` | 120 |
| `(3 + 4) ** 2` | 49.0 |

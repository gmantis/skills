# Graph `load_customers.mp`: what happens to each record

*Design note (synthetic eval source; Ab Initio-style graph).*

```
Input File (customers.dat) → Reformat "clean" → Lookup "country" → Filter by Expression "active" → Output File (customers_ok.dat)
                                   ↓ reject                ↓ unmatched                 ↓ deselect
                              rejects.dat              rejects.dat               inactive.dat
```

- **clean**: trims `name`; `amount` must parse as a decimal ≥ 0, otherwise the record is **rejected** with
  "bad amount". A NULL `country` is passed through unchanged.
- **country**: looks up `country` in `countries.dat` (SG, MY, GB, US) and adds `region`. A code that is not in the file
  is sent to the same `rejects.dat` with "unknown country". NULL country is also unmatched.
- **active**: keeps records with `status == "A"`; the others go to `inactive.dat`.

Sample input (8 records):

| id | name | amount | country | status |
|---|---|---|---|---|
| 1 | " Ann " | 120.50 | SG | A |
| 2 | "Bo" | -5 | MY | A |
| 3 | "Cy" | 40 | XX | A |
| 4 | "Di" | 75 | GB | I |
| 5 | "Ed" | abc | US | A |
| 6 | "Fa" | 10 | NULL | A |
| 7 | "Gi" | 300 | US | A |
| 8 | "Ho" | 0 | SG | I |

Expected counts: clean 8 in → 6 out + 2 rejects (ids 2, 5); country 6 in → 4 out + 2 unmatched (ids 3, 6);
active 4 in → 2 out (ids 1, 7) + 2 deselected (ids 4, 8). Output 2, rejects.dat 4, inactive.dat 2.

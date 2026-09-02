---
type: Fixed
pr: 4173
---
**Fixed the coverage gate OOM-crashing on every push to `next`.** The scripts/ coverage-floor check was the one c8 coverage-merge invocation missing the async-merge flag its siblings already carry (same root cause as #4068, on a third sibling script #4068 missed), so it loaded every shard's raw coverage into memory at once instead of incrementally and blew the 8GB CI heap ceiling. (#4172)

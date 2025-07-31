# agent-tracing-zdr

## Overview

This project provides a trace processor that logs traces and spans to a local SQLite database. It is designed for OpenAI customers who are on a zero-data-retention plan but still want to capture and analyze local logs for their agent workflows.

## Features
- Stores traces and spans in a local SQLite database
- Easy integration with OpenAI agent workflows
- No data leaves your environment—ideal for zero-data-retention compliance

## Usage

The `local_tracer.py` file can be copied and used in isolation. The only package dependency is the [OpenAI Agents SDK](https://openai.github.io/openai-agents-python/)

Once you've cloned or copied this file you can simply import it into your agent code as a drop-in replacement for the standard tracing.
```python
from local_tracer import LocalTraceProcessor
from agents.tracing import set_trace_processors

set_trace_processors([LocalTraceProcessor()])
```

Alternatively, this can be used in conjunction with the normal tracing:

```python
from local_tracer import LocalTraceProcessor
from agents.tracing import add_trace_processor

add_trace_processor(LocalTraceProcessor())
```

2. **Run your agent as usual.**

Traces and spans will be logged to a local SQLite database file (e.g., `traces_v1.db`).

3. **OR - See a live example in demo.py**

* Install the dependencies
* Set environment variables in `.env`
* Run  `demo.py` 

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.

## Contributing

Pull requests and issues are welcome!

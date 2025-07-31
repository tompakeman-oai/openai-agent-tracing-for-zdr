import asyncio
import logging
from datetime import datetime

from agents import Agent, Runner, function_tool, trace
from agents.tracing import set_trace_processors
from dotenv import load_dotenv
from local_tracer import LocalTraceProcessor
from openai import OpenAI

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

load_dotenv(override=True)


client = OpenAI()


@function_tool
def web_search(query: str) -> str:
    """Search the web for information and return back a summary of the results"""
    global client
    result = client.responses.create(
        model="gpt-4o-mini",
        input=f"Search the web for '{query}' and reply with only the result.",
        tools=[{"type": "web_search_preview"}],
    )
    return result.output_text


agent = Agent(
    name="Test agent",
    model="o3",
    instructions="Reason and answer the question.",
    tools=[web_search],
)


async def main():
    set_trace_processors([LocalTraceProcessor()])
    with trace("Testing", metadata={"timestamp": datetime.now().isoformat()}) as t:
        result = await Runner.run(
            agent,
            input=f"What's the latest news (as of {t.metadata['timestamp']}) from OpenAI?",
        )
        logger.info(result)


if __name__ == "__main__":
    asyncio.run(main())

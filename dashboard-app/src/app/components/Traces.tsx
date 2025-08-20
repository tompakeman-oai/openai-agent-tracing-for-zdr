"use client";
import { useAppContext } from "../state/AppContext";
import { useState, FocusEvent, useEffect } from "react";
import { buildOrderedSpanTree, OrderedSpanNode } from "../utils";
import { AutoAwesome, Build, Bolt, Code, Message } from "@mui/icons-material";

const PRIMARY_GRAY = "#44454b"; // medium gray

const filterConfigs = [
  { label: "Workflow", key: "workflows", placeholder: "Search Workflow" },
  { label: "Group ID", key: "groupIds", placeholder: "Search Group ID" },
  { label: "Trace ID", key: "traceIDs", placeholder: "Search Trace ID" },
  { label: "Span ID", key: "spanIDs", placeholder: "Search Span ID" },
] as const;
type FilterKey = (typeof filterConfigs)[number]["key"];

// Define Trace type locally (since not exported from context)
type Trace = {
  id: number;
  trace_id: string;
  workflow_name: string;
  group_id: string;
  metadata: string;
};

// FilterDropdown component
interface FilterDropdownProps {
  label: string;
  options: string[];
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  placeholder: string;
  selected: string[];
  setSelected: (opts: string[]) => void;
}

const colorClassMap: Record<string, {bg: string, text: string}> = {
  agent: {bg: "bg-blue-400", text: "text-blue-400"},
  function: {bg: "bg-green-400", text: "text-green-400"},
  guardrail: {bg: "bg-purple-400", text: "text-purple-400"},
  tool: {bg: "bg-red-400", text: "text-red-400"},
  response: {bg: "bg-gray-400", text: "text-gray-400"},
  default: {bg: "bg-yellow-400", text: "text-yellow-400"},
};

const getIcon = (type: string) => {
  switch (type) {
    case "agent":
      return <AutoAwesome className={`${colorClassMap["agent"].text}`} />;
    case "guardrail":
      return <Code className={`${colorClassMap["guardrail"].text}`} />;
    case "function":
      return <Code className={`${colorClassMap["function"].text}`} />;
    case "tool":
      return <Build className={`${colorClassMap["tool"].text}`} />;
    case "response":
      return <Message className={`${colorClassMap["response"].text}`} />;
    default:
      return <Bolt className={`${colorClassMap["default"].text}`} />;
  }
};


const FilterDropdown = ({
  label,
  options,
  open,
  onOpen,
  onClose,
  placeholder,
  selected,
  setSelected,
}: FilterDropdownProps) => {
  const [searchValue, setSearchValue] = useState("");
  // Filter options based on searchValue and exclude already selected
  const filteredOptions = options.filter(
    (option) =>
      option.toLowerCase().includes(searchValue.toLowerCase()) &&
      !selected.includes(option)
  );
  const handleOptionClick = (option: string) => {
    setSelected([...selected, option]);
    setSearchValue("");
  };
  const handleRemoveTag = (option: string) => {
    setSelected(selected.filter((o) => o !== option));
  };
  return (
    <div className="flex-1 min-w-[180px] max-w-xs">
      <label className="block text-xs font-semibold text-gray-700 mb-1 ml-1">
        {label}
      </label>
      <div className="relative">
        <input
          type="text"
          className="w-full rounded-md border border-gray-300 bg-white py-2 px-3 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-gray-400 focus:border-gray-400"
          placeholder={placeholder}
          value={searchValue}
          onChange={(e) => setSearchValue(e.target.value)}
          onFocus={onOpen}
          onBlur={(e: FocusEvent<HTMLInputElement>) => setTimeout(onClose, 100)}
        />
        {/* Show selected filter options as tags */}
        {selected.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {selected.map((opt) => (
              <span
                key={opt}
                className="inline-block bg-gray-200 text-gray-700 text-xs px-2 py-1 rounded cursor-pointer"
                onClick={() => handleRemoveTag(opt)}
              >
                {opt} &times;
              </span>
            ))}
          </div>
        )}
        {open && (
          <div className="absolute left-0 right-0 mt-1 max-h-40 overflow-y-auto rounded-md bg-white border border-gray-200 shadow-lg text-sm z-10">
            {filteredOptions.length > 0 ? (
              filteredOptions.map((option) => (
                <div
                  key={option}
                  className="px-3 py-2 hover:bg-gray-100 cursor-pointer text-gray-800"
                  onMouseDown={() => handleOptionClick(option)}
                >
                  {option}
                </div>
              ))
            ) : (
              <div className="px-3 py-2 text-gray-400">No options</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

// FilterBar component
interface FilterBarProps {
  filters: Record<FilterKey, string[]>;
  openDropdown: FilterKey | null;
  setOpenDropdown: (key: FilterKey | null) => void;
  selected: Record<FilterKey, string[]>;
  setSelected: (key: FilterKey, opts: string[]) => void;
}
const FilterBar = ({
  filters,
  openDropdown,
  setOpenDropdown,
  selected,
  setSelected,
}: FilterBarProps) => (
  <nav
    className="w-full bg-gray-100 border-b border-gray-200 shadow-sm"
    style={{ borderColor: PRIMARY_GRAY }}
  >
    <div className="px-4 py-2 flex flex-wrap gap-4">
      {filterConfigs.map((filter) => (
        <FilterDropdown
          key={filter.key}
          label={filter.label}
          options={filters[filter.key] || []}
          open={openDropdown === filter.key}
          onOpen={() => setOpenDropdown(filter.key)}
          onClose={() => setOpenDropdown(null)}
          placeholder={filter.placeholder}
          selected={selected[filter.key]}
          setSelected={(opts) => setSelected(filter.key, opts)}
        />
      ))}
    </div>
  </nav>
);

export const TraceList = () => {
  const { currentViewTraces, filters } = useAppContext();
  const [openDropdown, setOpenDropdown] = useState<FilterKey | null>(null);
  const [selected, setSelectedState] = useState<Record<FilterKey, string[]>>({
    workflows: [],
    groupIds: [],
    traceIDs: [],
    spanIDs: [],
  });
  const setSelected = (key: FilterKey, opts: string[]) => {
    setSelectedState((prev) => ({ ...prev, [key]: opts }));
  };
  // Filtering logic
  const filteredTraces = currentViewTraces.filter((trace) => {
    if (
      selected.workflows.length > 0 &&
      !selected.workflows.includes(trace.workflow_name)
    )
      return false;
    if (
      selected.groupIds.length > 0 &&
      !selected.groupIds.includes(trace.group_id)
    )
      return false;
    if (
      selected.traceIDs.length > 0 &&
      !selected.traceIDs.includes(trace.trace_id)
    )
      return false;
    return true;
  });
  return (
    <div>
      <FilterBar
        filters={filters}
        openDropdown={openDropdown}
        setOpenDropdown={setOpenDropdown}
        selected={selected}
        setSelected={setSelected}
      />
      <div className="overflow-x-auto">
        <table className="min-w-full bg-white border border-gray-200 rounded-lg shadow-sm">
          <thead>
            <tr className="bg-gray-100 text-gray-700 text-sm">
              <th className="px-4 py-2 text-left">Trace ID</th>
              <th className="px-4 py-2 text-left">Workflow</th>
              <th className="px-4 py-2 text-left">Group ID</th>
              <th className="px-4 py-2 text-left">Metadata</th>
            </tr>
          </thead>
          <tbody>
            {filteredTraces.map((trace: Trace, index: number) => (
              <TraceListItem key={index} trace={trace} />
            ))}
            {filteredTraces.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-gray-400">
                  No traces found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const TraceListItem = ({ trace }: { trace: Trace }) => {
  const { updateDashboardView, viewDetailedTrace } = useAppContext();

  const handleClick = () => {
    viewDetailedTrace(trace);
    updateDashboardView("traces", trace.trace_id);
  };

  return (
    <tr
      className="hover:bg-gray-50 cursor-pointer border-b border-gray-100 transition-colors"
      onClick={handleClick}
    >
      <td className="px-4 py-2 font-mono text-xs text-gray-800">
        {trace.trace_id}
      </td>
      <td className="px-4 py-2 font-mono text-xs text-gray-800">
        {trace.workflow_name}
      </td>
      <td className="px-4 py-2 font-mono text-xs text-gray-800">
        {trace.group_id}
      </td>
      <td className="px-4 py-2 font-mono text-xs text-gray-600 truncate max-w-xs">
        {trace.metadata}
      </td>
    </tr>
  );
};

const SpanList = ({
  spans,
  level,
  minTs,
  tickSize,
}: {
  spans: OrderedSpanNode[];
  level: number;
  minTs: number;
  tickSize: number;
}) => {
  return (
    <div className="flex flex-col gap-2 w-full">
      {spans.map((span, idx) => (
        <div
          key={idx}
          className={`flex flex-col gap-2 pl-${(level + 1) * 2}rem`}
        >
          <SpanListItem
            key={span.span_id}
            span={span}
            minTs={minTs}
            tickSize={tickSize}
            level={level}
          />
          {span.children.length > 0 && (
            <SpanList
              spans={span.children}
              level={level + 1}
              minTs={minTs}
              tickSize={tickSize}
            />
          )}
        </div>
      ))}
    </div>
  );
};

const SpanListItem = ({
  span,
  minTs,
  tickSize,
  level,
}: {
  span: OrderedSpanNode;
  minTs: number;
  tickSize: number;
  level: number;
}) => {
  const { setCurrentSpanDetail } = useAppContext();
  const structuredSpan = JSON.parse(span.span_data);
  const startTs = new Date(span.started_at).getTime();
  const endTs = new Date(span.ended_at).getTime();
  const duration = endTs - startTs;
  const startPercent = (startTs - minTs) / tickSize * 100;
  const widthPercent = (duration / tickSize) * 100;
  console.log({
    startPercent,
    widthPercent,
  })    

  return (
    <div
      className="w-full grid grid-cols-[7fr_3fr] gap-2 px-2 hover:bg-gray-100 cursor-pointer"
      style={{ paddingLeft: `${level * 2}rem` }}
      onClick={() => setCurrentSpanDetail(span)}
    >
      <div className="flex flex-row gap-2 p-2 items-center border-b border-gray-200">
        <span>{getIcon(structuredSpan.span_data.type)}</span>
        {
          <h2 className="text-xs text-gray-500">
            {structuredSpan.span_data.type == "response"
              ? "POST /v1/responses"
              : structuredSpan.span_data.name}
          </h2>
        }
      </div>
      <div className="gap-2 items-center w-full grid grid-cols-[2fr_3fr]">
        <span className="text-xs text-gray-500">
          {duration.toLocaleString(undefined, { maximumFractionDigits: 2 })}ms
        </span>
        <div id='span-progress-bar-outer' className="w-full h-3 bg-gray-200 rounded-full overflow-hidden relative">
          <div
            id='span-progress-bar-inner'
            className={`h-full absolute ${colorClassMap[structuredSpan?.span_data?.type as keyof typeof colorClassMap]?.bg || colorClassMap["default"].bg}`}
            style={{
              left: `${startPercent}%`,
              width: `${widthPercent}%`,
            }}
          />
        </div>
      </div>
    </div>
  );
};

const SpanDetail = () => {
  const { currentSpanDetail } = useAppContext();
  const structuredSpan = JSON.parse(currentSpanDetail?.span_data || "{}");

  const renderData = () => {
    if (structuredSpan?.span_data?.type == "function") {
      return (
        <>
          <h3 className="text-sm font-bold">Input</h3>
          <code className="text-xs text-gray-500 whitespace-pre-wrap break-words bg-gray-100 p-2 rounded-md font-mono">
            {JSON.stringify(structuredSpan?.span_data?.input)}
          </code>
          <h3 className="text-sm font-bold">Output</h3>
          <code className="text-xs text-gray-500 whitespace-pre-wrap break-words bg-gray-100 p-2 rounded-md font-mono">
            {JSON.stringify(structuredSpan?.span_data?.output)}
          </code>
        </>
      );
    } else {
      return (
        <code className="text-xs text-gray-500 whitespace-pre-wrap break-words bg-gray-100 p-2 rounded-md font-mono">
          {JSON.stringify(structuredSpan?.span_data)}
        </code>
      );
    }
  };

  return (
    <div className="p-4 h-full  border-l border-gray-400">
      <div className="flex flex-row gap-2 items-center">
        <h2 className="text-lg font-bold">
          {structuredSpan?.span_data?.type == "response"
            ? "POST /v1/responses"
            : structuredSpan?.span_data?.name}
        </h2>
        <span className="text-xs text-gray-500">
          {getIcon(structuredSpan?.span_data?.type)}
        </span>
      </div>
      <div className="flex flex-col gap-2 mt-2">{renderData()}</div>
    </div>
  );
};

export const TraceDetail = () => {
  const { currentViewSpans } = useAppContext();
  const [displaySpans, setDisplaySpans] = useState<OrderedSpanNode[]>([]);
  const maxTs = currentViewSpans.reduce(
    (max, span) => Math.max(max, new Date(span.ended_at).getTime()),
    0
  );
  const minTs = currentViewSpans.reduce(
    (min, span) => Math.min(min, new Date(span.started_at).getTime()),
    maxTs
  );
  const tickSize = maxTs - minTs;

  useEffect(() => {
    setDisplaySpans(buildOrderedSpanTree(currentViewSpans));
  }, [currentViewSpans]);

  return (
    <div className="p-4 flex flex-row gap-4 h-full">
      <div className="w-[70%] flex-none">
        <SpanList
          spans={displaySpans}
          level={0} 
          minTs={minTs}
          tickSize={tickSize}
        />
      </div>
      <div className="w-[30%] flex-none">
        <SpanDetail />
      </div>
    </div>
  );
};
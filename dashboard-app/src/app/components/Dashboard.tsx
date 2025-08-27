"use client";
import { useAppContext } from "../state/AppContext";
import { TraceList, TraceDetail } from "./Traces";
import { Charts } from "./Charts";
import { BarChart, TableChart } from "@mui/icons-material";

const PRIMARY_GRAY = "#44454b"; // medium gray

const TitleBar = () => {
  const {
    updateDashboardView,
    dashboardView,
    currentTraceDetail,
  } = useAppContext();

  const handleClick = () => {
    updateDashboardView("traces", null);
  };

  return (
    <header
      className="w-full bg-gray-800 text-white shadow-md"
      style={{ backgroundColor: PRIMARY_GRAY }}
    >
      <div className="max-w-7xl px-6 py-2 flex items-center flex-row gap-2">
        {/* Navigation icons */}
        <div className="flex items-center gap-2 mr-2">
          <button
            onClick={() => updateDashboardView("charts", null)}
            aria-label="Show charts"
            title="Charts"
            className="p-1 rounded hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-white/30"
          >
            <BarChart fontSize="small" />
          </button>
          <button
            onClick={() => updateDashboardView("traces", null)}
            aria-label="Show traces"
            title="Traces"
            className="p-1 rounded hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-white/30"
          >
            <TableChart fontSize="small" />
          </button>
        </div>
        |
        {dashboardView === "traceList" ? (
          <h1 className="text-2xl font-bold tracking-tight">Traces</h1>
        ) : (
          dashboardView === "charts" ? (
            <h1 className="text-2xl font-bold tracking-tight">Charts</h1>
          ) : (
          <>
            <h1
              className="text-2xl font-bold tracking-tight cursor-pointer hover:underline"
              onClick={handleClick}
              tabIndex={0}
              role="button"
              aria-label="Back to Traces"
            >
              Traces
            </h1>
            <h2>{`> ${currentTraceDetail?.trace_id}`}</h2>
          </>
          )
        )}
      </div>
    </header>
  );
};


export const Dashboard = () => {
  const { dashboardView } = useAppContext();

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      <TitleBar />
      <main className="flex-1 min-h-0 bg-white rounded-t-2xl shadow-inner overflow-auto">
        {dashboardView === "traceList" && <TraceList />}
        {dashboardView === "traceDetail" && <TraceDetail />}
        {dashboardView === "charts" && <Charts />}
      </main>
    </div>
  );
};

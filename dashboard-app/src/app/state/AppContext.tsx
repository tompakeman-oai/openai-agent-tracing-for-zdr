"use client";
import React, {
  createContext,
  useContext,
  useState,
  ReactNode,
  useEffect,
  useRef,
  useReducer,
} from "react";

type Trace = {
  id: number;
  trace_id: string;
  workflow_name: string;
  group_id: string;
  metadata: string;
};

export type Span = {
  id: number;
  span_id: string;
  trace_id: string;
  parent_id: string;
  started_at: string;
  ended_at: string;
  span_data: string;
  error: string;
};

export type FiltersState = {
  workflows: string[];
  groupIds: string[];
  traceIDs: string[];
  spanIDs: string[];
  maxTraceId: number | null;
};

type AppContextType = {
  filters: FiltersState;
  currentViewTraces: Trace[];
  currentTraceDetail: Trace | null;
  currentViewSpans: Span[];
  setCurrentViewSpans: (spans: Span[]) => void;
  setCurrentTraceDetail: (trace: Trace | null) => void;
  currentSpanDetail: Span | null;
  setCurrentSpanDetail: (span: Span | null) => void;
  dashboardView: AllowedViews;
  setDashboardView: (view: AllowedViews) => void;
  viewDetailedTrace: (trace: Trace) => void;
  updateDashboardView: (view: AllowedUrlPaths, subView: string | null) => void;
};

type AllowedViews = "traceList" | "traceDetail" | "charts";
type AllowedUrlPaths = "charts" | "traces";

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider = ({ children }: { children: ReactNode }) => {
  const [currentViewTraces, setCurrentViewTraces] = useState<Trace[]>([]);
  const [currentViewSpans, setCurrentViewSpans] = useState<Span[]>([]);
  const [currentTraceDetail, setCurrentTraceDetail] = useState<Trace | null>(null);
  const [currentSpanDetail, setCurrentSpanDetail] = useState<Span | null>(null);
  
  const [dashboardView, setDashboardView] = useState<AllowedViews>("traceList");

  const initialState: FiltersState = {
    workflows: [],
    groupIds: [],
    traceIDs: [],
    spanIDs: [],
    maxTraceId: null,
  };

  type FiltersAction =
    | { type: "SET_WORKFLOWS"; payload: string[] }
    | { type: "SET_GROUP_IDS"; payload: string[] }
    | { type: "SET_TRACE_IDS"; payload: string[] }
    | { type: "SET_SPAN_IDS"; payload: string[] }
    | { type: "SET_MAX_TRACE_ID"; payload: number };

  const [filters, setFilters] = useReducer(reducer, initialState);

  const updateDashboardView = (view: AllowedUrlPaths, subView: string | null = null) => {
    let path = "/";
    if (view === "charts") {
      path += "charts";
      setDashboardView("charts");
    } else if (view === "traces") {
      path += "trace";
      if (subView) {
        path += `/${subView}`;
        setDashboardView("traceDetail");
      }
      else {
        setDashboardView("traceList");
      }
    }
    window.history.pushState({ view, subView }, "", path);
  };

  function reducer(state: FiltersState, action: FiltersAction): FiltersState {
    switch (action.type) {
      case "SET_WORKFLOWS":
        return { ...state, workflows: action.payload };
      case "SET_GROUP_IDS":
        return { ...state, groupIds: action.payload };
      case "SET_TRACE_IDS":
        return { ...state, traceIDs: action.payload };
      case "SET_SPAN_IDS":
        return { ...state, spanIDs: action.payload };
      case "SET_MAX_TRACE_ID":
        return { ...state, maxTraceId: action.payload };
      default:
        return state;
    }
  }

  /*
   * Fetch all filterable values from the database
   */
  const fetchAllFilters = () => {
    fetch("/api/sql", {
      method: "POST",
      body: JSON.stringify({
        columns: ["workflow_name", "group_id", "trace_id"],
        query:
          "SELECT DISTINCT workflow_name, group_id, trace_id FROM traces GROUP BY 1, 2, 3",
      }),
      headers: {
        "Content-Type": "application/json",
      },
    })
      .then((response) => response.json())
      .then((data) => {
        setFilters({
          type: "SET_WORKFLOWS",
          payload: Array.from(
            new Set(
              data
                .map((row: any) => row.workflow_name)
                .filter((v: any) => v != null)
            )
          ),
        });
        setFilters({
          type: "SET_GROUP_IDS",
          payload: Array.from(
            new Set(
              data.map((row: any) => row.group_id).filter((v: any) => v != null)
            )
          ),
        });
        setFilters({
          type: "SET_TRACE_IDS",
          payload: Array.from(
            new Set(
              data.map((row: any) => row.trace_id).filter((v: any) => v != null)
            )
          ),
        });
        setFilters({
          type: "SET_MAX_TRACE_ID",
          payload: Math.max(...data.map((row: any) => row.id)),
        });
      });
    fetch("/api/sql", {
      method: "POST",
      body: JSON.stringify({
        columns: ["span_id"],
        query: "SELECT span_id FROM spans GROUP BY 1",
      }),
      headers: {
        "Content-Type": "application/json",
      },
    })
      .then((response) => response.json())
      .then((data) => {
        setFilters({
          type: "SET_SPAN_IDS",
          payload: Array.from(
            new Set(
              data.map((row: any) => row.span_id).filter((v: any) => v != null)
            )
          ),
        });
      });
  };

  /*
   * Fetch the last N traces from the database
   */
  const fetchLastTracesByWindow = async (
    minId: number | null = null,
    maxId: number | null = null,
    limit: number | null = null
  ) => {
    let query = `SELECT trace_id, group_id, workflow_name, metadata FROM traces`;
    let filters = [];
    if (minId !== null) {
      filters.push(`id >= ${minId}`);
    }
    if (maxId !== null) {
      filters.push(`id <= ${maxId}`);
    }
    if (filters.length > 0) {
      query += ` WHERE ${filters.join(" AND ")}`;
    }
    if (limit !== null) {
      query += ` ORDER BY id DESC LIMIT ${limit}`;
    }
    fetch("/api/sql", {
      method: "POST",
      body: JSON.stringify({
        columns: ["trace_id", "group_id", "workflow_name", "metadata"],
        query: query,
      }),
      headers: {
        "Content-Type": "application/json",
      },
    })
      .then((response) => response.json())
      .then((data) => {
        setCurrentViewTraces(data);
      });
  };

  const fetchSpansForTrace = async (traceId: string) => {
    const response = await fetch("/api/sql", {
      method: "POST",
      body: JSON.stringify({
        columns: ["span_id", "trace_id", "parent_id", "started_at", "ended_at", "span_data", "error"],
        query: `SELECT span_id, trace_id, parent_id, started_at, ended_at, span_data, error FROM spans WHERE trace_id = '${traceId}'`,
      }),
      headers: {
        "Content-Type": "application/json",
      },
    })
    return response.json();
  };

  const viewDetailedTrace = async (trace: Trace) => {
    const spans = await fetchSpansForTrace(trace.trace_id);
    setCurrentViewSpans(spans);
    setCurrentTraceDetail(trace);
    setCurrentSpanDetail(spans[0]);
  }

  useEffect(() => {
    fetchAllFilters();
    fetchLastTracesByWindow(null, null, 20);
  }, []);

  // handle browser navigation and initial URL load
  useEffect(() => {
    const parsePath = () => {
      const { pathname } = window.location;
      const segments = pathname.split('/').filter(Boolean);
      updateDashboardView(segments[0] as AllowedUrlPaths, segments[1] || null);
    };
    window.addEventListener('popstate', parsePath);
    // initial load
    parsePath();
    return () => window.removeEventListener('popstate', parsePath);
  }, []);

  const value: AppContextType = {
    filters,
    currentViewTraces,
    dashboardView,
    setDashboardView,
    currentTraceDetail,
    setCurrentTraceDetail,
    currentSpanDetail,
    setCurrentSpanDetail,
    currentViewSpans,
    setCurrentViewSpans,
    viewDetailedTrace,
    updateDashboardView,
    };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

export const useAppContext = () => {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error("useAppContext must be used within an AppProvider");
  }
  return context;
};

"use client";
import { AppProvider } from "../state/AppContext";
import { Dashboard } from "./Dashboard";

export const App = () => {
  return (
    <AppProvider>
      <Dashboard />
    </AppProvider>
  );
};
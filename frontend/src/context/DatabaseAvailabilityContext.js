import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import DatabaseUnavailableOverlay from "../components/DatabaseUnavailableOverlay";

const DatabaseAvailabilityContext = createContext(null);

export const useDatabaseAvailability = () => useContext(DatabaseAvailabilityContext);

export function DatabaseAvailabilityProvider({ children }) {
  const [unavailable, setUnavailable] = useState(false);
  const location = useLocation();
  const markDatabaseUnavailable = useCallback(() => setUnavailable(true), []);
  const markDatabaseAvailable = useCallback(() => setUnavailable(false), []);

  useEffect(() => {
    window.addEventListener("vidya:database-unavailable", markDatabaseUnavailable);
    window.addEventListener("vidya:database-available", markDatabaseAvailable);
    return () => {
      window.removeEventListener("vidya:database-unavailable", markDatabaseUnavailable);
      window.removeEventListener("vidya:database-available", markDatabaseAvailable);
    };
  }, [markDatabaseAvailable, markDatabaseUnavailable]);

  const isStatusScreen = location.pathname === "/admin/data-source";
  return (
    <DatabaseAvailabilityContext.Provider value={{ unavailable, markDatabaseUnavailable, markDatabaseAvailable }}>
      {children}
      {unavailable && !isStatusScreen && <DatabaseUnavailableOverlay />}
    </DatabaseAvailabilityContext.Provider>
  );
}
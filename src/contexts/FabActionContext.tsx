import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';

export type FabActionConfig = {
  label: string;
  icon: string;
  colors: readonly [string, string, ...string[]];
  iconColor: string;
  labelColor: string;
  onPress: () => void;
};

type FabActionContextValue = {
  setFabAction: (route: string, config: FabActionConfig | null) => void;
  getFabAction: (route: string | null) => FabActionConfig | null;
};

const FabActionContext = createContext<FabActionContextValue | null>(null);

export const FabActionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [actions, setActions] = useState<Record<string, FabActionConfig | null>>({});

  const setFabAction = useCallback((route: string, config: FabActionConfig | null) => {
    setActions((prev) => ({ ...prev, [route]: config }));
  }, []);

  const getFabAction = useCallback(
    (route: string | null) => (route ? actions[route] ?? null : null),
    [actions]
  );

  const value = useMemo(
    () => ({
      setFabAction,
      getFabAction,
    }),
    [setFabAction, getFabAction]
  );

  return <FabActionContext.Provider value={value}>{children}</FabActionContext.Provider>;
};

export const useFabAction = () => {
  const context = useContext(FabActionContext);
  if (!context) {
    throw new Error('useFabAction must be used within a FabActionProvider');
  }
  return context;
};

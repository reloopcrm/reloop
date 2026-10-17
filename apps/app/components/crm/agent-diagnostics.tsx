"use client";

import { createContext, type ReactNode, useContext } from "react";

const AgentDiagnosticsContext = createContext(false);

export function AgentDiagnosticsProvider({
	canManage,
	children,
}: {
	canManage: boolean;
	children: ReactNode;
}) {
	return (
		<AgentDiagnosticsContext.Provider value={canManage}>
			{children}
		</AgentDiagnosticsContext.Provider>
	);
}

export function useCanSeeAgentDiagnostics(): boolean {
	return useContext(AgentDiagnosticsContext);
}

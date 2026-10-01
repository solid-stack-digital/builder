import React from "react";

export interface AppProps {
  frontendSource: string;
  backendSource: string;
  backendStatus: string;
}

export const App: React.FC<AppProps> = ({ frontendSource, backendSource, backendStatus }) => {
  return (
    <div id="root-container" style={{ fontFamily: "Arial, sans-serif", padding: "2rem" }}>
      <h1>Solid Stack Digital - Fullstack Application</h1>
      <div id="frontend-source">{`Frontend: ${frontendSource}`}</div>
      <div id="backend-source">{`Backend Dependency: ${backendSource}`}</div>
      <div id="backend-status">{`Backend Status: ${backendStatus}`}</div>
    </div>
  );
};

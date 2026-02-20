export type PackLabel = {
  name: string;
  description: string;
};

export type Pack = {
  name: string;
  labels: PackLabel[];
};

export const coding: Pack = {
  name: "coding",
  labels: [
    { name: "Project", description: "Repository identity" },
    { name: "Pattern", description: "Coding conventions" },
    { name: "Component", description: "Files and modules" },
    { name: "Error", description: "Errors and resolutions" },
    { name: "Tool", description: "Libraries and frameworks" },
  ],
};

export const general: Pack = {
  name: "general",
  labels: [
    { name: "Person", description: "People entities" },
    { name: "Organization", description: "Organizations" },
    { name: "Location", description: "Locations" },
    { name: "Resource", description: "Documents and links" },
    { name: "Directive", description: "Behavior rules" },
  ],
};

export const ops: Pack = {
  name: "ops",
  labels: [
    { name: "Service", description: "Systems and platforms" },
    { name: "Endpoint", description: "API endpoints" },
    { name: "Procedure", description: "Operational workflows" },
    { name: "Schema", description: "API schema/format" },
    { name: "Credential", description: "Credential metadata" },
  ],
};

export const builtin = [coding, general, ops];

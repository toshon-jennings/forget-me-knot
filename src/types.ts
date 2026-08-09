export type ServiceStatus = "active" | "archived";

export interface Service {
  id: string;
  name: string;
  url: string;
  favicon: string;
  category: string | null;
  notes: string | null;
  addedAt: string;
  lastUsedAt: string;
  status: ServiceStatus;
}

export interface Category {
  id: string;
  label: string;
}

export interface ToolBox {
  services: Service[];
  categories: Category[];
}

export const DEFAULT_CATEGORIES: Category[] = [
  { id: "ai", label: "AI & Agents" },
  { id: "dev", label: "Developer Tools" },
  { id: "media", label: "Media & Design" },
  { id: "infra", label: "Infra & Cloud" },
  { id: "productivity", label: "Productivity" },
];

export const EMPTY_TOOLBOX: ToolBox = {
  services: [],
  categories: DEFAULT_CATEGORIES,
};

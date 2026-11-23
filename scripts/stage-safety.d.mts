export function stageBackendConfig(root: string, env: NodeJS.ProcessEnv): {
  host: string;
  port: number;
  database: string;
};

export const productionHost = '__PRODUCTION_HOST__';
export const localHost = '__LOCAL_HOST__';

export const authProductionHost = '__AUTH_PRODUCTION_HOST__';
export const authLocalHost = '__AUTH_LOCAL_HOST__';

export const rpcPath = '/rpc/greeting';

export const appName = '__CLI_NAME__';

export const isProdStage = (stage: string): boolean => stage === 'prod';

export const hostsFor = (stage: string): { host: string; authHost: string } =>
  isProdStage(stage)
    ? { host: productionHost, authHost: authProductionHost }
    : { host: localHost, authHost: authLocalHost };

export const instanceConfigFor = (hosts: {
  host: string;
  authHost: string;
}): { authWorkerUrl: string; apiUrl: string } => ({
  authWorkerUrl: `https://${hosts.authHost}`,
  apiUrl: `https://${hosts.host}`,
});

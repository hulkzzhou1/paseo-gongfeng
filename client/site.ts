import { useQuery } from "@tanstack/react-query";
import { useRpc } from "@getpaseo/plugin/client";
import { connectionStatus } from "../shared/connection.ts";

export function useSiteUrl() {
  const status = useRpc(connectionStatus);
  const connection = useQuery({ queryKey: ["connection"], queryFn: () => status({}), retry: false });
  return connection.data && "siteUrl" in connection.data ? connection.data.siteUrl : undefined;
}

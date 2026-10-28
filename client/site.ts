import { useRef } from "react";
import { connectionForView, queryPolicy } from "./query-policy.ts";
import { useQuery } from "@tanstack/react-query";
import { useRpc } from "@getpaseo/plugin/client";
import { connectionStatus } from "../shared/connection.ts";

export function useConnectionState() {
  const status = useRpc(connectionStatus);
  const connection = useQuery({ ...queryPolicy("list"), queryKey: ["connection"], queryFn: () => status({}), retry: false });
  const previous=useRef<Extract<NonNullable<typeof connection.data>,{status:"connected"}>|undefined>(undefined);
  previous.current=connectionForView(previous.current,connection.data,connection.isError);
  return {query:connection,connection:previous.current};
}

export function useConnection() { return useConnectionState().connection; }
export function useSiteUrl() { return useConnection()?.siteUrl; }

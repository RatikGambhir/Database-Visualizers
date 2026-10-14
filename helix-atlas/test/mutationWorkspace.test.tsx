// @vitest-environment jsdom
import { act, fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import type { QueryExecution } from "../src/client";
import { QueryEditor } from "../src/ui/QueryEditor";
import { ParameterEditor } from "../src/ui/ParameterEditor";
import { api, compileDraft, connectWorkspace, mountWorkspace } from "./support/workspace";
import { compiled, deferred, execution, graph } from "./support/fixtures";

const source = "INSERT INTO NODES:User DEFAULT VALUES";
const mutation = { plannedNodes: 1, plannedEdges: 0, statements: [], parameters: [], executable: true, blockedReason: "" };
const receipt = { kind: "mutation" as const, outcome: "committed" as const, durability: "acknowledged" as const, insertedNodes: 1, insertedEdges: 0, statements: [] };

it("blocks duplicate submits until the mutation settles", async () => {
  const hook = await mountWorkspace(); await connectWorkspace(hook);
  api.compileQuery.mockResolvedValue({ ...compiled(source), executionKind: "write", mutation });
  act(() => hook.result.current.setQuery(source)); await compileDraft();
  const pending = deferred<QueryExecution>(); api.runQuery.mockReturnValue(pending.promise);
  let first!: Promise<void>;
  act(() => { first = hook.result.current.onRun(); });
  await act(async () => { await hook.result.current.onRun(); });
  expect(api.runQuery).toHaveBeenCalledTimes(1);
  await act(async () => { pending.resolve(execution(receipt, source)); await first; });
  expect(hook.result.current.run.result).toEqual(receipt);
});

it("retains a committed receipt when graph and schema refresh fail", async () => {
  const hook = await mountWorkspace(); await connectWorkspace(hook);
  api.runQuery.mockResolvedValueOnce(execution({ kind:"graph",graph }));
  await act(async () => { await hook.result.current.onRun(); });
  api.compileQuery.mockResolvedValue({ ...compiled(source), executionKind:"write", mutation });
  act(() => hook.result.current.setQuery(source)); await compileDraft();
  api.runQuery.mockResolvedValueOnce(execution(receipt,source)).mockRejectedValue(new Error("graph offline"));
  api.loadSchema.mockRejectedValue(new Error("schema offline"));
  await act(async () => { await hook.result.current.onRun(); });
  expect(hook.result.current.run.result).toEqual(receipt);
  expect(hook.result.current.run.error).toBeNull();
  expect(hook.result.current.graph).toEqual(graph);
  expect(hook.result.current.mutationRefreshError).toContain("Graph refresh");
  expect(hook.result.current.mutationRefreshError).toContain("Schema refresh");
});

it("stale parameters cannot be executed before recompilation", async () => {
  const hook = await mountWorkspace(); await connectWorkspace(hook);
  act(() => hook.result.current.setParameterRows([{id:0,name:"id",type:"nodeId",value:"18446744073709551615"}]));
  await act(async () => { await hook.result.current.onRun(); });
  expect(api.runQuery).not.toHaveBeenCalled();
  await compileDraft();
  expect(api.compileQuery).toHaveBeenLastCalledWith(hook.result.current.query,{id:{type:"nodeId",value:"18446744073709551615"}});
});

it("labels mutation execution and blocks unsupported adapters on shortcuts", () => {
  vi.stubGlobal("matchMedia", vi.fn(() => ({matches:false})));
  const onRun = vi.fn();
  render(<QueryEditor value={source} onChange={vi.fn()} onRun={onRun} running={false} available error={null} compiled={{...compiled(source), executionKind:"write", mutation:{...mutation,executable:false,blockedReason:"legacy read only"}}} />);
  expect((screen.getByRole("button",{name:"Run mutation"}) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.keyDown(screen.getByRole("textbox"),{key:"Enter",ctrlKey:true});
  expect(onRun).not.toHaveBeenCalled();
});

it("offers a typed parameter form without converting integer text to a number", () => {
  const onChange = vi.fn();
  render(<ParameterEditor rows={[{id:0,name:"id",type:"nodeId",value:""}]} onChange={onChange} />);
  fireEvent.change(screen.getByLabelText("Parameter 1 value"),{target:{value:"18446744073709551615"}});
  expect(onChange).toHaveBeenCalledWith([{id:0,name:"id",type:"nodeId",value:"18446744073709551615"}]);
});

it("refreshes the previous graph with its own parameters and bounds", async () => {
  const hook = await mountWorkspace(); await connectWorkspace(hook);
  const graphSource = "QUERY NODES WHERE name = :name LIMIT 7";
  const parameters = {name:{type:"string",value:"Alice"}};
  act(() => {
    hook.result.current.setQuery(graphSource);
    hook.result.current.setParameterRows([{id:0,name:"name",type:"string",value:"Alice"}]);
  });
  await compileDraft();
  api.runQuery.mockResolvedValueOnce(execution({kind:"graph",graph},graphSource));
  await act(async () => { await hook.result.current.onRun(); });
  api.compileQuery.mockResolvedValue({...compiled(source),executionKind:"write",mutation});
  act(() => { hook.result.current.setQuery(source); hook.result.current.setParameterRows([]); });
  await compileDraft();
  api.runQuery.mockResolvedValueOnce(execution(receipt,source)).mockResolvedValueOnce(execution({kind:"graph",graph},graphSource));
  await act(async () => { await hook.result.current.onRun(); });
  expect(api.runQuery).toHaveBeenLastCalledWith(graphSource,parameters);
  expect(hook.result.current.run.result).toEqual(receipt);
  expect(hook.result.current.schemaLoading).toBe(false);
});

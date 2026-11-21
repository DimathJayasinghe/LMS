import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, renderHook, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CollectionBranch, useRememberedBranch } from "./CollectionBranch";

const institutes = [{ id: "i1", name: "Kandy" }, { id: "i2", name: "Galle" }];
const KEY = "lms.collectionBranch";

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe("useRememberedBranch", () => {
  it("starts with no branch when nothing was chosen before", () => {
    const { result } = renderHook(() => useRememberedBranch(institutes));
    expect(result.current[0]).toBe("");
  });

  it("brings back the branch chosen on this device earlier", () => {
    localStorage.setItem(KEY, "i2");
    const { result } = renderHook(() => useRememberedBranch(institutes));
    expect(result.current[0]).toBe("i2");
  });

  it("forgets a branch that no longer exists instead of recording cash against it", () => {
    localStorage.setItem(KEY, "gone");
    const { result } = renderHook(() => useRememberedBranch(institutes));
    expect(result.current[0]).toBe("");
  });

  it("remembers a new choice, and clears it when no branch is chosen", () => {
    const { result } = renderHook(() => useRememberedBranch(institutes));
    act(() => result.current[1]("i1"));
    expect(result.current[0]).toBe("i1");
    expect(localStorage.getItem(KEY)).toBe("i1");
    act(() => result.current[1](""));
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it("still works when the browser refuses storage", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
    const { result } = renderHook(() => useRememberedBranch(institutes));
    expect(result.current[0]).toBe("");
    act(() => result.current[1]("i1"));
    expect(result.current[0]).toBe("i1");
  });
});

describe("CollectionBranch", () => {
  it("shows nothing when there are no branches to choose from", () => {
    const { container } = render(<CollectionBranch institutes={[]} value="" onChange={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("lists the branches with a no-branch choice and reports the pick", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<CollectionBranch institutes={institutes} value="" onChange={onChange} />);
    expect(screen.getByRole("option", { name: "No branch" })).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("Collecting at"), "i1");
    expect(onChange).toHaveBeenCalledWith("i1");
  });
});

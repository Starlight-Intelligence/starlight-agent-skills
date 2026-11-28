"""Run the public, read-only MCP examples in the developer showcase."""

import argparse
import hashlib
import json
from time import monotonic
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit
from urllib.request import Request, urlopen

STARLIGHT = "https://starlightintelligence.ai/mcp"
ACADEMY = "https://starlightintelligence.academy/mcp"
INCOME = "https://www.agenticincome.ai/api/mcp"
GENCREATOR = "https://gencreator.ai/api/mcp"
INTERVIEW = {
    "name": "interview-evidence-brief",
    "description": "Trace customer interview findings to quoted evidence.",
    "outcome": "Return a brief with evidence, uncertainty and a founder decision.",
    "kind": "skill",
    "targets": ["codex", "claude"],
}
MARGIN = {"priceUsd": 67, "feeSupplyIds": ["polar-starter-fee"]}


def require(condition, message):
    if not condition:
        raise ValueError(message)


def post(url, headers, message):
    request = Request(url, json.dumps(message).encode("utf-8"), headers)
    with urlopen(request, timeout=25) as response:
        if response.status == 202:
            require("id" not in message, "Received an empty response to a request")
            return None, response.headers
        body = response.read(2_000_001)
        require(len(body) <= 2_000_000, "MCP response exceeds the example's size limit")
        if response.headers.get_content_type() == "text/event-stream":
            events = body.decode("utf-8").replace("\r\n", "\n").split("\n\n")
            for event in events:
                data = "\n".join(line[5:].lstrip(" ") for line in event.splitlines()
                                 if line.startswith("data:"))
                if data:
                    reply = json.loads(data)
                    if reply.get("id") == message.get("id"):
                        return reply, response.headers
            raise ValueError("No matching JSON-RPC reply in event stream")
        require(response.headers.get_content_type() == "application/json",
                "Expected an MCP JSON or event-stream response")
        return json.loads(body), response.headers


def rpc(url, headers, request_id, method, params):
    message = {"jsonrpc": "2.0", "method": method, "params": params}
    if request_id is not None:
        message["id"] = request_id
    reply, response_headers = post(url, headers, message)
    if request_id is not None:
        require(reply.get("jsonrpc") == "2.0" and reply.get("id") == request_id,
                f"{method}: unexpected JSON-RPC envelope")
    return reply, response_headers


def read_demo(url, tool, arguments, invalid=None):
    headers = {"Content-Type": "application/json", "Accept": "application/json, text/event-stream"}
    started = monotonic()
    initial, response_headers = rpc(url, headers, 1, "initialize", {
        "protocolVersion": "2025-03-26",
        "capabilities": {},
        "clientInfo": {"name": "starlight-developer-demo", "version": "1.0.0"},
    })
    headers["MCP-Protocol-Version"] = initial["result"]["protocolVersion"]
    if session := response_headers.get("Mcp-Session-Id"):
        headers["Mcp-Session-Id"] = session
    rpc(url, headers, None, "notifications/initialized", {})
    listing, _ = rpc(url, headers, 2, "tools/list", {})
    tools = listing["result"]["tools"]
    entry = next((entry for entry in tools if entry["name"] == tool), {})
    schema = entry.get("inputSchema", {})
    require(schema.get("type") == "object", f"{tool}: missing input schema")
    require(set(schema.get("required", [])) <= arguments.keys(), f"{tool}: required input changed")
    reply, _ = rpc(url, headers, 3, "tools/call", {"name": tool, "arguments": arguments})
    result = reply.get("result", {})
    require("error" not in reply and not result.get("isError"), f"{tool}: {reply}")
    data = result.get("structuredContent")
    if data is None:
        data = json.loads(result["content"][0]["text"])
    receipt = {"endpoint": url, "tool": tool, "toolCount": len(tools),
               "protocolVersion": headers["MCP-Protocol-Version"],
               "requiredInputs": schema.get("required", [])}
    if invalid is not None:
        rejected, _ = rpc(url, headers, 4, "tools/call", {"name": tool, "arguments": invalid})
        result = rejected.get("result", {})
        require("error" in rejected or result.get("isError") is True,
                f"{tool}: bad input was accepted")
        receipt["invalidInputRejected"] = True
    receipt["elapsedSeconds"] = round(monotonic() - started, 3)
    return data, receipt


def foundry(full):
    data, receipt = read_demo(STARLIGHT, "compile_capability", INTERVIEW, {"name": "Invalid Name"})
    declared = data["receipt"]
    require(declared["algorithm"] == "sha256", "Unexpected receipt algorithm")
    files = {file["path"]: file["content"] for file in data["files"]}
    expected = {entry["path"]: entry["sha256"] for entry in declared["files"]}
    require(len(files) == len(data["files"]) and len(expected) == len(declared["files"]),
            "Duplicate file paths in the package or receipt")
    require(set(files) == set(expected) | {"receipt.json"} and "receipt.json" not in expected,
            "File list and receipt differ")
    for path, digest in expected.items():
        require(hashlib.sha256(files[path].encode("utf-8")).hexdigest() == digest,
                f"File checksum mismatch: {path}")
    serialized = json.dumps(declared["files"], ensure_ascii=False, indent=2) + "\n"
    require(hashlib.sha256(serialized.encode("utf-8")).hexdigest() == declared["digest"],
            "Receipt checksum mismatch")
    require({target["id"]: target["state"] for target in data["targets"]}
            == {"claude": "draft", "codex": "draft"}, "Unexpected target state")
    return {"transport": receipt, "verifiedFiles": len(expected), "sha256": declared["digest"],
            "targets": data["targets"], "draft": data if full else files[
                "skills/interview-evidence-brief/SKILL.md"].splitlines()[:5]}


def director(full):
    data, receipt = read_demo(GENCREATOR, "gencreator_get_director_lesson", {}, {"lessonId": "unknown"})
    recipe = data["recipe"]
    require(recipe["schema"] == "gencreator.director-lesson.v1" and recipe["lessonId"] == "field-notes",
            "Unexpected recipe contract")
    require(len(recipe["shots"]) == 3 and len(data["shots"]) == 3
            and [shot["id"] for shot in recipe["shots"]] == [shot["id"] for shot in data["shots"]],
            "Lesson and recipe should share the same three shots")
    require(data["usage"] == {"creditsCharged": 0, "modelCalls": 0, "externalWrites": False},
            "Unexpected lesson usage")
    return {"transport": receipt, "lesson": data["lessonUrl"], "usage": data["usage"],
            "recipe": recipe, "shotTitles": [shot["title"] for shot in data["shots"]],
            **({"details": data} if full else {})}


def check(full):
    academy, academy_receipt = read_demo(ACADEMY, "get_academy", {})
    margin, margin_receipt = read_demo(INCOME, "calculate_unit_margin", MARGIN, {"priceUsd": 0})
    require(margin["ok"] and margin["priceIsHypothesis"], "Expected a modeled margin")
    require(isinstance(academy["challenges"], list) and bool(academy["challenges"]),
            "The academy catalog has no challenges")
    return {"academy": {"transport": academy_receipt, "title": academy["title"],
                        "challengeCount": len(academy["challenges"]),
                        **({"details": academy} if full else {})},
            "economicsScenario": {"transport": margin_receipt, "result": margin}}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("demo", choices=("foundry", "director", "check"))
    parser.add_argument("--full", action="store_true", help="Include full public example output")
    args = parser.parse_args()
    try:
        result = {"foundry": foundry, "director": director, "check": check}[args.demo](args.full)
    except HTTPError as exc:
        parser.exit(1, f"HTTP {exc.code} from {urlsplit(exc.url).netloc}\n")
    except (URLError, OSError, ValueError, KeyError, TypeError, IndexError) as exc:
        parser.exit(1, f"Demo could not be verified: {exc}\n")
    print(json.dumps(result, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()

# Codex

Install one skill in a workspace. Run these commands from a project that contains
a clone of this repository named `starlight-agent-skills`.

```sh
mkdir -p .agents/skills
cp -R starlight-agent-skills/skills/research/claim-verification .agents/skills/
```

Open Codex from the project root and select the skill through `/skills`, or
mention `$claim-verification` in a prompt. Keep the entire skill directory so
the instructions can reach its examples and supporting files. For more locations
and discovery behavior see [Codex skill documentation](https://developers.openai.com/codex/skills).

Skill installation gives Codex instructions. Any separately required MCP server
or browser tool still needs its own configuration and permissions. Check the
specific skill's requirements before executing a task.

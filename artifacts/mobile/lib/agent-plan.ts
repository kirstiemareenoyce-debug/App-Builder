export type AgentPlanStep = {
  title: string;
  description: string;
  priority: "low" | "medium" | "high";
};

const MAX_STEPS = 8;
const MAX_TITLE_LENGTH = 200;
const MAX_DESCRIPTION_LENGTH = 2000;
const PLAN_LINE = /^\s*(?:\d+[.)]|[-*•])\s+(.+?)\s*$/;

/** Parse explicitly formatted, editable task lines from an Evergreen plan. */
export function parseAgentPlanSteps(text: string): AgentPlanStep[] {
  const steps: AgentPlanStep[] = [];

  for (const line of text.split(/\r?\n/)) {
    if (steps.length >= MAX_STEPS) break;

    const match = PLAN_LINE.exec(line);
    if (!match) continue;

    const fields = match[1].split("|");
    const title = fields.shift()?.trim() ?? "";
    const description = fields.join("|").trim();

    if (
      !title ||
      title.length > MAX_TITLE_LENGTH ||
      fields.length > 1 ||
      (fields.length === 1 && !description) ||
      description.length > MAX_DESCRIPTION_LENGTH
    ) {
      continue;
    }

    steps.push({ title, description, priority: "medium" });
  }

  return steps;
}

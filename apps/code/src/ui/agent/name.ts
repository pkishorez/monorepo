/*
 * How a Harness Account is named where the app shows which one runs: its
 * agent's logo, then the account's own name unless it is the agent's
 * Default Account, whose id is the agent's. The agent's name is not said
 * again: "Claude Work" is "Work" beside the Claude logo. Where no logo can
 * go, as in a label read aloud or a search, it is one word: "Claude", or
 * "Claude-Work".
 */

export type Agent = 'claude' | 'codex';

const AGENT: Record<Agent, string> = { claude: 'Claude', codex: 'Codex' };

/** The agent's name, as its logo says it. */
export const agentName = (agent: Agent) => AGENT[agent];

/** A Harness Account, as the Machine names it. */
export interface Named {
  readonly agent: Agent;
  /** Its id; the Default Account's is the agent's. */
  readonly account: string;
  /** Its name, such as "Claude" or "Claude Work"; null while not known. */
  readonly name: string | null;
}

/** What follows the logo: the account's name without its agent's, or null for the Default Account. */
export const accountName = ({ agent, account, name }: Named) => {
  if (account === agent) return null;
  const own = name ?? account;
  const word = agentName(agent);
  const rest = own.toLowerCase().startsWith(`${word.toLowerCase()} `)
    ? own.slice(word.length + 1).trim()
    : own.trim();
  return rest === '' || rest.toLowerCase() === word.toLowerCase() ? null : rest;
};

/** The account in plain text: "Claude", or "Claude-Work". */
export const plainName = (named: Named) => {
  const rest = accountName(named);
  return rest === null
    ? agentName(named.agent)
    : `${agentName(named.agent)}-${rest}`;
};

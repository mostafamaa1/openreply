/**
 * Output shapes of the five content agents, as stored in AgentRun.output.
 * No server imports, so the Agents page can use them too.
 */

export interface PostRef {
  caption: string | null;
  url: string | null;
  type: string;
  views: number | null;
  likes: number | null;
  comments: number | null;
  postedAt: string | null;
}

export interface AnalystOutput {
  username: string;
  followers: number | null;
  followerChange30d: number | null;
  totals: {
    posts: number;
    views: number;
    likes: number;
    comments: number;
    saved: number;
    shares: number;
  };
  engagementRate: number | null;
  topPosts: PostRef[];
  last30: { posts: number; views: number; avgViews: number | null };
  prev30: { posts: number; views: number; avgViews: number | null };
  formats: Array<{ format: string; posts: number; avgViews: number }>;
  bestWeekdays: Array<{ weekday: string; posts: number; avgViews: number }>;
  bestHour: number | null;
  timeZone: string;
  competitors: Array<{
    username: string;
    followersCount: number | null;
    postCount: number;
    avgViews: number | null;
    topPost: PostRef | null;
  }>;
  /** All-time performance per content category (older runs lack it). */
  categories?: Array<{
    category: string;
    posts: number;
    medianViews: number;
    avgViews: number;
    engagementRate: number | null;
    savesPer1k: number | null;
    sharesPer1k: number | null;
  }>;
  notes: string[];
}

export interface Idea {
  /** Content category (older runs lack it). */
  category?: string;
  title: string;
  angle: string;
  why: string;
  format: string;
  inspiredBy: string | null;
}

export interface IdeatorOutput {
  ideas: Idea[];
  /** How many ideas each category was given, and why (older runs lack it). */
  allocation?: Array<{ category: string; ideas: number; reason: string }>;
}

export interface Script {
  ideaTitle: string;
  hooks: string[];
  script: string;
  cta: string;
}

export interface HookScriptOutput {
  scripts: Script[];
}

export interface PlannerOutput {
  timeZone: string;
  days: Array<{
    date: string;
    weekday: string;
    time: string;
    title: string;
    hook: string;
    format: string;
    cta: string;
  }>;
}

export interface DmManagerOutput {
  windowDays: number;
  sent: number;
  skippedDedup: number;
  failed: number;
  pending: number;
  clicks: number;
  activeCampaigns: number;
  campaigns: Array<{ name: string; sent: number; clicks: number }>;
  keywords: Array<{ keyword: string; count: number }>;
  failures: Array<{
    commenter: string;
    campaign: string;
    error: string;
    at: string;
  }>;
  notes: string[];
}

export interface AgentOutputs {
  IDEATOR: IdeatorOutput;
  HOOK_SCRIPT: HookScriptOutput;
  PLANNER: PlannerOutput;
  ANALYST: AnalystOutput;
  DM_MANAGER: DmManagerOutput;
}

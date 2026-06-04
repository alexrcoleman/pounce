import fs from "fs";
import path from "path";

type ProfileNode = {
  id: number;
  callFrame: {
    functionName: string;
    url: string;
    lineNumber: number;
    columnNumber: number;
  };
};

type CpuProfile = {
  nodes: ProfileNode[];
  samples?: number[];
  timeDeltas?: number[];
};

const profilePath = process.argv[2] ?? findLatestProfile(process.cwd());
if (!profilePath) {
  throw new Error("Pass a .cpuprofile path or run from a directory with one.");
}

const profile = JSON.parse(fs.readFileSync(profilePath, "utf8")) as CpuProfile;
const nodesById = new Map(profile.nodes.map((node) => [node.id, node]));
const selfMicrosById = new Map<number, number>();
const samples = profile.samples ?? [];
const timeDeltas = profile.timeDeltas ?? [];

samples.forEach((nodeId, index) => {
  selfMicrosById.set(
    nodeId,
    (selfMicrosById.get(nodeId) ?? 0) + (timeDeltas[index] ?? 1)
  );
});

const totalMicros = Array.from(selfMicrosById.values()).reduce(
  (sum, value) => sum + value,
  0
);

const rows = Array.from(selfMicrosById.entries())
  .map(([nodeId, selfMicros]) => {
    const node = nodesById.get(nodeId);
    const callFrame = node?.callFrame;
    return {
      selfMs: selfMicros / 1000,
      percent: totalMicros === 0 ? 0 : (selfMicros / totalMicros) * 100,
      functionName: callFrame?.functionName || "(anonymous)",
      location: formatLocation(callFrame?.url ?? "", callFrame?.lineNumber),
    };
  })
  .filter((row) => row.selfMs > 0)
  .sort((left, right) => right.selfMs - left.selfMs)
  .slice(0, readIntegerEnv("PROFILE_TOP", 25));

console.log(
  JSON.stringify(
    {
      profilePath,
      totalMs: totalMicros / 1000,
      topSelfTime: rows,
    },
    null,
    2
  )
);

function findLatestProfile(directory: string): string | null {
  const profiles = fs
    .readdirSync(directory)
    .filter((fileName) => fileName.endsWith(".cpuprofile"))
    .map((fileName) => path.join(directory, fileName))
    .map((filePath) => ({
      filePath,
      mtimeMs: fs.statSync(filePath).mtimeMs,
    }))
    .sort((left, right) => right.mtimeMs - left.mtimeMs);
  return profiles[0]?.filePath ?? null;
}

function formatLocation(url: string, lineNumber: number | undefined): string {
  const normalizedUrl = url.replace(/^file:\/+/, "");
  const relativeUrl = path.isAbsolute(normalizedUrl)
    ? path.relative(process.cwd(), normalizedUrl)
    : normalizedUrl;
  return lineNumber == null || lineNumber < 0
    ? relativeUrl
    : `${relativeUrl}:${lineNumber + 1}`;
}

function readIntegerEnv(name: string, fallback: number): number {
  const value = process.env[name];
  if (!value) {
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

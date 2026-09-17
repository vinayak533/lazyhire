export const locations = {
  kerala: {
    label: "All Kerala",
    search: "Kerala, India",
    aliases: ["kerala", "all kerala", "all", ""],
  },
  kochi: {
    label: "Kochi",
    search: "Kochi, Kerala, India",
    aliases: ["kochi", "cochin"],
  },
  kozhikode: {
    label: "Kozhikode",
    search: "Kozhikode, Kerala, India",
    aliases: ["kozhikode", "calicut"],
  },
  thiruvananthapuram: {
    label: "Thiruvananthapuram",
    search: "Thiruvananthapuram, Kerala, India",
    aliases: ["thiruvananthapuram", "trivandrum"],
  },
  thrissur: {
    label: "Thrissur",
    search: "Thrissur, Kerala, India",
    aliases: ["thrissur", "trichur"],
  },
  ernakulam: {
    label: "Ernakulam",
    search: "Ernakulam, Kerala, India",
    aliases: ["ernakulam"],
  },
  kannur: {
    label: "Kannur",
    search: "Kannur, Kerala, India",
    aliases: ["kannur", "cannanore"],
  },
  kollam: {
    label: "Kollam",
    search: "Kollam, Kerala, India",
    aliases: ["kollam", "quilon"],
  },
} as const;
export type KeralaLocation = keyof typeof locations;
export interface SearchParams {
  query: string;
  location: KeralaLocation;
}

export function normalizeLocation(input: string): KeralaLocation | null {
  const value = input.trim().toLowerCase().replace(/\s+/g, " ");
  return (
    (Object.keys(locations) as KeralaLocation[]).find((key) =>
      (locations[key].aliases as readonly string[]).includes(value),
    ) ?? null
  );
}

export function matchesLocation(
  value: string,
  location: KeralaLocation,
): boolean {
  const text = value.toLowerCase();
  const metro = [
    "kochi",
    "cochin",
    "ernakulam",
    "kakkanad",
    "edappally",
    "kalamassery",
  ];
  if (location === "kerala") {
    return (
      /\b(kerala|cherthala|alappuzha|palakkad|malappuram|kottayam|wayanad|idukki|kasaragod|pathanamthitta)\b/.test(
        text,
      ) ||
      (Object.keys(locations) as KeralaLocation[])
        .filter((key) => key !== "kerala")
        .some((key) => matchesLocation(value, key))
    );
  }
  const names =
    location === "kochi" || location === "ernakulam"
      ? metro
      : locations[location].aliases;
  return names.some((name) => new RegExp(`\\b${name}\\b`, "i").test(text));
}

import { type User } from "../../../../domain";

const firstNames = [
  "Alice",
  "Bob",
  "Charlie",
  "Diana",
  "Eve",
  "Frank",
  "Grace",
  "Henry",
  "Ivy",
  "Jack",
  "Kate",
  "Leo",
  "Mia",
  "Noah",
  "Olivia",
  "Paul",
  "Quinn",
  "Ruby",
  "Sam",
  "Tara",
  "Uma",
  "Victor",
  "Wendy",
  "Xander",
  "Yara",
  "Zach",
];

const lastNames = [
  "Smith",
  "Johnson",
  "Williams",
  "Brown",
  "Jones",
  "Garcia",
  "Miller",
  "Davis",
  "Rodriguez",
  "Martinez",
  "Anderson",
  "Taylor",
  "Thomas",
  "Moore",
  "Jackson",
  "Martin",
  "Lee",
  "Thompson",
  "White",
  "Harris",
  "Clark",
  "Lewis",
];

const domains = [
  "gmail.com",
  "outlook.com",
  "yahoo.com",
  "proton.me",
  "icloud.com",
];

const statuses: User["status"][] = ["active", "inactive", "suspended"];

export function generateRandomUser(): User {
  const firstName = firstNames[Math.floor(Math.random() * firstNames.length)];
  const lastName = lastNames[Math.floor(Math.random() * lastNames.length)];
  const domain = domains[Math.floor(Math.random() * domains.length)];
  const status = statuses[Math.floor(Math.random() * statuses.length)];

  return {
    userId: `user_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    name: `${firstName} ${lastName}`,
    email: `${firstName?.toLowerCase()}.${lastName?.toLowerCase()}@${domain}`,
    status: status ?? "active",
    createdAt: Date.now(),
  };
}

export function generateUserId(): string {
  return `user_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

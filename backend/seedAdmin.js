import bcrypt from "bcrypt";
import { addToGrist, fetchFromGrist } from "./gristUtils.js";

// Dev SaaS admin credentials (change later)
const email = "admin@saas.com";
const password = "SuperSecret123";

try {
  // Check if user already exists
  const existing = await fetchFromGrist("Users");
  const found = existing.find(u => u.email === email);
  if (found) {
    console.log(`ℹ️  SaaS Admin already exists: ${email}`);
    process.exit(0);
  }

  const hashed = await bcrypt.hash(password, 12);

  // Use first_name/last_name to match your requested schema
  const record = {
    email,
    password: hashed,
    role: "SaaS Admin",
    fname: "Super",
    lname: "Admin",
  };

  const result = await addToGrist("Users", record);
  if (!result.success) {
    console.error("❌ Failed to create SaaS Admin:", result.error);
    process.exit(1);
  }

  console.log("✅ SaaS Admin created:", email);
  process.exit(0);
} catch (err) {
  console.error("❌ Error creating SaaS Admin:", err);
  process.exit(1);
}

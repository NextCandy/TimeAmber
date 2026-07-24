import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const email = process.env.ADMIN_EMAIL;
const password = process.env.ADMIN_INITIAL_PASSWORD;

if (!url || !serviceKey || !email || !password) {
  throw new Error("Supabase URL, service key, admin email and initial password are required");
}

const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

let user;
for (let page = 1; page <= 20 && !user; page++) {
  const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 100 });
  if (error) throw error;
  user = data.users.find((candidate) => candidate.email?.toLowerCase() === email.toLowerCase());
  if (data.users.length < 100) break;
}

if (!user) {
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { display_name: "TimeAmber Admin" },
  });
  if (error) throw error;
  user = data.user;
} else {
  const { data, error } = await supabase.auth.admin.updateUserById(user.id, {
    password,
    email_confirm: true,
  });
  if (error) throw error;
  user = data.user;
}

const { error: profileError } = await supabase.from("profiles").upsert({
  user_id: user.id,
  email,
  role: "admin",
  must_change_password: true,
  updated_at: new Date().toISOString(),
});
if (profileError) throw profileError;

console.log("TimeAmber administrator initialized");


# 👑 Kitty Queen 🐱✨

A sparkly, kitty-themed chat site for the Kitty Queen and her friends, at **kittyqueen.club**.

- **Kitty Castle:** a group chat for everyone, plus **private chats** between any two kitties
- **Make-your-own-kitty avatars:** fur color, eye color, crowns, bows, tiaras, stripes, spots
- **Kitty stickers and reactions** (💖 🐾 ✨ 😹 👑 🌈), a little *meow* when a message arrives, sparkles everywhere
- **Text only:** no pictures, no links you can tap
- **Invite-only:** only grown-up emails on the invite list can get in
- **Grown-up Corner** (protected by a PIN): any grown-up can read *every* chat, including private ones. Admins manage the invite list and can hide messages from the kids.
- **Works great on tablets:** add it to the home screen and it acts like an app

## How it works

```
 Tablet (kittyqueen.club)  ──►  Supabase (free)
 - plain HTML/CSS/JS             - email sign-in (magic link + 6-digit code)
 - hosted on GitHub Pages        - database with security rules
                                 - live message updates
```

There is no server for you to look after. The **security rules in the database**
(`supabase/schema.sql`) are what keep it private: even someone poking at the
site can't read anything unless their email is on the invite list.

Kids never type an email. A grown-up signs in once on the kid's tablet, makes a
4-digit Grown-up PIN, and helps the kid make their kitty. The tablet stays signed in after that.

## Try it right now (demo mode)

While `js/config.js` has no Supabase keys, the site runs in **demo mode**:
pretend friends (Luna, Mochi, Pixie, Tiger Lily) who even reply, and nothing
leaves the browser. Any email and any code work.

```bash
python3 -m http.server 8000
# open http://localhost:8000
```

---

## Setup guide (about 30–45 minutes, one time)

### 1. Create the database (Supabase, free)
1. Go to <https://supabase.com>, sign up, and click **New project**. Name it `kittyqueen`, pick a strong database password (save it), and choose the region closest to you.
2. Open **SQL Editor → New query**, paste in the whole of [`supabase/schema.sql`](supabase/schema.sql), and click **Run**.
3. Make yourself the admin. Run this in a new query, **using your own email**:
   ```sql
   insert into public.allowed_emails (email, note) values ('you@example.com', 'Kitty Queen''s grown-up');
   insert into public.admins (email) values ('you@example.com');
   ```
   (Use lowercase letters for the email.)

### 2. Sign-in settings
In Supabase, open **Authentication**:
1. **URL Configuration:** set **Site URL** to `https://kittyqueen.club`, and add `https://kittyqueen.club/**` under **Redirect URLs**.
2. **Emails → Templates → Magic Link:** replace the template with this, so the email also has a code:
   ```html
   <h2>🐱 Your Kitty Queen sign-in</h2>
   <p>Type this code on the tablet:</p>
   <p style="font-size:32px;font-weight:bold;letter-spacing:6px">{{ .Token }}</p>
   <p>Or tap this link <b>on the tablet</b>: <a href="{{ .ConfirmationURL }}">Sign in to Kitty Queen ✨</a></p>
   ```
   Subject: `Your Kitty Queen code 👑`.
   (A tablet often opens email links in the mail app instead of the browser, which is why the code is there.)
3. **Optional, recommended:** under **Authentication → Hooks**, add a **Before User Created** hook, choose *Postgres*, and pick `public.hook_only_invited`. Strangers then can't even create a login.

### 3. Email sending (important!)
Supabase's built-in email is **for testing only**. It only delivers to the email
addresses of your Supabase team, and just a few per hour. To email other
parents, connect a free email service. [Resend](https://resend.com) is easy:
1. Sign up at Resend, then **Domains → Add domain** → `kittyqueen.club`.
2. Resend shows a few DNS records. Add each one in **GoDaddy → My Products → kittyqueen.club → DNS → Add record**. Wait for Resend to say *Verified*.
3. In Resend, create an **API key**.
4. In Supabase, open **Authentication → Emails → SMTP Settings**, turn on custom SMTP, and enter:
   - Host `smtp.resend.com`, Port `465`, Username `resend`, Password = *your Resend API key*
   - Sender email `hello@kittyqueen.club`, Sender name `Kitty Queen`

### 4. Connect the site to the database
In Supabase, open **Project Settings → API** (or **API Keys**) and copy the **Project URL** and the
**anon / publishable** key into [`js/config.js`](js/config.js). That key is meant to be public;
the database rules are what protect the chats. Commit and push.

### 5. Put it on kittyqueen.club (GitHub Pages, free)
1. On GitHub, open the repo's **Settings → Pages**. Under **Build and deployment**, choose **Deploy from a branch**, then branch `main` and folder `/ (root)`. Save.
2. In the same page, set **Custom domain** to `kittyqueen.club`. The `CNAME` file in this repo already says this.
3. In **GoDaddy → DNS** for kittyqueen.club:
   - Delete any existing **A** record for `@` ("Parked") and any domain **Forwarding**.
   - Add four **A** records for `@`: `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`
   - Add a **CNAME** record: name `www`, value `le-sanglier.github.io`
4. Wait for DNS (minutes to a few hours), then tick **Enforce HTTPS** in GitHub Pages.

### 6. Set up each tablet
1. Open **kittyqueen.club** in Safari (iPad) or Chrome (Android).
2. Grown-up: type your email and enter the code from the email.
3. Pick your name and a 4-digit Grown-up PIN, then let your kid make their kitty! 🎨
4. **Add to Home Screen.** On iPad, tap Share → *Add to Home Screen*. On Android, tap ⋮ → *Add to Home screen*.

### Inviting a friend's family
Grown-up Corner (🔒) → **Invite list** → add their grown-up's email. Then send them
to kittyqueen.club and they do step 6 on their kid's tablet.
Removing an email locks that family out right away.

---

## Safety features
- Invite-only, enforced by the database rather than just hidden by the website.
- Kids only post as their own kitty, and only in the group chat or their own private chats.
- Messages are text only, at most 500 characters, and can't be edited. There's a gentle spam limit of 15 messages per minute.
- Any grown-up can read every chat. Admins can hide a message from the kids (grown-ups can still see it).
- No photos, no real names required, no public profiles. Search engines are told not to list the site.
- Kitty names must be unique, so no one can pretend to be someone else.

## Project layout
```
index.html               page shell
css/style.css            all the sparkle
js/app.js                screens: sign-in, kitty maker, chat, Grown-up Corner
js/kitty.js              make-your-own-kitty SVG avatars
js/api.js                picks real (Supabase) or demo backend
js/api-supabase.js       real backend
js/api-demo.js           demo backend (localStorage)
js/sparkle.js, sound.js  twinkles, tap sparkles, meow sounds
js/config.js             your Supabase URL + key
supabase/schema.sql      database tables + security rules
supabase/test/           automated tests for the security rules
```

## Testing the security rules
Needs PostgreSQL installed locally (not as root):
```bash
supabase/test/run.sh
```
It checks things like: strangers see nothing, you can't post as someone else's
kitty, only admins see the invite list, and removing an invite locks a family out.

## Ideas for later 💡
- Bedtime / school-hours "quiet time" when chatting is paused
- A shared virtual pet cat the group takes care of
- Polls, "Kitty of the Day", a shared drawing board
- Simple games (tic-tac-toe) in chat
- Badges and sparkle themes to unlock

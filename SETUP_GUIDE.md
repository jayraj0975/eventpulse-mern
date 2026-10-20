# Complete Setup Guide: MongoDB Atlas & Application Configuration

This guide will walk you through exactly how to set up your backend dependencies, including MongoDB Atlas (the remote cloud database), followed by starting up the application.

---

## Step 1: Set Up MongoDB Atlas (Your Database)

MongoDB Atlas provides a fully managed, free cloud database. This is where `mongoose` will store all your `Users`, `Events`, and `Bookings`.

1. **Sign Up / Log In**:
   - Go to [MongoDB Atlas](https://www.mongodb.com/cloud/atlas/register) and create a free account.
2. **Create a Cluster**:
   - Once logged in, click **"Build a Database"** or **"Create Cluster"**.
   - Select the **"M0 Sandbox" (Free Tier)** option.
   - Choose a provider (e.g., AWS, Google Cloud) and click **Create** (no credit card required).
3. **Set Up Database Access (Credentials)**:
   - On the left sidebar, click **"Database Access"**.
   - Click **"Add New Database User"**.
   - Choose **Password** authentication.
   - Set a Username (e.g., `eventoradmin`) and a Password (e.g., `eventorapassword`). **Remember these.**
   - Click **Add User**.
4. **Set Up Network Access (IP Access List)**:
   - On the left sidebar, click **"Network Access"**.
   - Add the narrowest IP access rule that works for your development environment or hosting provider.
   - Avoid `0.0.0.0/0` for a database with real data; it allows connections from any IP and should not be the default recommendation.
   - Click **Confirm**.
5. **Get Your Connection String**:
   - On the left sidebar, click **"Database"** (under Deployments).
   - Click the **"Connect"** button on your new cluster.
   - Choose **"Drivers"** (Connect your application).
   - Copy the connection string provided. It will look something like this:
     `mongodb+srv://eventoradmin:<password>@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority`
   - **Important**: Replace `<password>` in the string with the actual password you created in Step 3. (Do not include the `< >` brackets).

---

## Step 2: Set Up Gmail App Passwords (For Nodemailer)

To send emails automatically (booking confirmations), you need to configure an App Password for your Gmail account. Normal passwords won't work because of 2FA.

1. Go to your [Google Account Manage page](https://myaccount.google.com/).
2. Navigate to the **Security** tab on the left.
3. Under "How you sign in to Google", select **2-Step Verification** and make sure it is turned ON.
4. Once ON, go back to the Security tab, search for **App Passwords** in the search bar.
5. Generate a new App Password (select "Other" and name it "Eventora").
6. Copy the 16-character password generated.

---

## Step 3: Configure the Environment Variables (`.env`)

Now that you have your credentials, you need to plug them into the backend. Open the file located at `server/.env` and paste your values:

```env
# Paste the MongoDB string you generated (make sure you swapped the password)
MONGO_URI=mongodb+srv://eventoradmin:your_actual_password@cluster0.xxxxx.mongodb.net/eventora?retryWrites=true&w=majority

# Generate a long, random secret for local use. Never commit real secrets or reuse a sample value in production.
JWT_SECRET=replace_with_a_long_random_secret_not_committed

# Email Setup Configured using Step 2
EMAIL_USER=yourgmail@gmail.com
EMAIL_PASS=the_16_character_app_password

PORT=5000
```

---

## Step 4: Run the Application!

### Start the Backend
Open a terminal inside the `/server` folder:
```bash
cd server
npm run dev
```
If you configured your `MONGO_URI` correctly, the terminal will say:
> `Server running on port 5000`
> `MongoDB Connected`


### Start the Frontend
Open a new terminal inside the `/client` folder:
```bash
cd client
npm run dev
```
It will provide a local URL (e.g., `http://localhost:5173/`). Open this in your browser.

---

## Step 5: Test the API with Postman

An export file named `Eventora_Postman_Collection.json` is included in the root of the project. This contains every API route pre-configured.

1. Open [Postman](https://www.postman.com/downloads/).
2. Click **Import** (top left).
3. Drag and drop the `Eventora_Postman_Collection.json` file into the window.
4. The collection will act as an end-to-end script utilizing environment variables:
   - Run the **Register User** request, then trigger **Verify Account OTP**, to activate your first admin/user account.
   - Run the **Login** request. (This will automatically save your auth token into Postman).
   - Run **Create Event (Admin)**. This will automatically save the `event_id`.
   - Run **Send Booking OTP Request** to trigger an OTP code email to yourself.
   - Run **Verify & Request Booking** (using your emailed OTP) to put your ticket request in the 'Pending' queue. This will save your `booking_id`.
   - Run **Confirm Booking (Admin - Paid)** to finalize the order, deduct a seat, and trigger a confirmation email.
   - Or test **Cancel/Reject Booking (Admin/User)**.

You're done! The full user to admin pipeline is ready to be tested both on the frontend React App and in Postman.


## Safety reminders
- Keep real credentials only in ignored local `.env` files or the hosting provider's secret/environment-variable settings. Never commit database URIs, email app passwords, or production JWT secrets.
- Use a disposable database for seeding and integration tests. Never seed or run destructive tests against production data.
- For MongoDB network access, prefer a narrow IP allowlist rather than opening access to every IP.
- Before a college demonstration, verify the current live frontend and backend health endpoint and test the user/admin flows. Do not infer end-to-end health from a successful build alone.

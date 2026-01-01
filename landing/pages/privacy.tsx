import Head from 'next/head'

export default function PrivacyPolicy() {
  return (
    <>
      <Head>
        <title>FitArc Privacy Policy</title>
        <meta name="description" content="FitArc privacy policy and data practices." />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>
      <main className="policy-page">
        <div className="container">
          <div className="policy-card">
            <h1>Privacy Policy</h1>
            <p className="policy-updated">Last updated: January 1, 2026</p>

            <p>
              FitArc helps you plan workouts, track meals, and follow progress
              over time. This policy explains what data we collect, how we use
              it, and the choices you have.
            </p>

            <h2>Information We Collect</h2>
            <ul>
              <li>Account details (email and basic profile settings).</li>
              <li>Fitness data you provide (plans, workouts, meals, progress logs).</li>
              <li>Device and app data (app version, device type, and usage events).</li>
            </ul>

            <h2>How We Use Your Information</h2>
            <ul>
              <li>Provide core app features like planning and tracking.</li>
              <li>Sync your data across devices and keep it available.</li>
              <li>Improve stability, performance, and user experience.</li>
            </ul>

            <h2>Data Sharing</h2>
            <p>
              We use trusted service providers to store and process data (for
              example, database and hosting services). We do not sell your
              personal information.
            </p>

            <h2>Data Retention</h2>
            <p>
              We keep your data while your account is active. You can request
              deletion by contacting us.
            </p>

            <h2>Your Choices</h2>
            <ul>
              <li>Update your profile information in the app.</li>
              <li>Request data export or deletion.</li>
            </ul>

            <h2>Contact</h2>
            <p>
              For questions or requests, email{' '}
              <a href="mailto:tedtfu@gmail.com">tedtfu@gmail.com</a>.
            </p>

            <div className="policy-footer">
              <a href="/">Back to FitArc</a>
            </div>
          </div>
        </div>
      </main>
    </>
  )
}

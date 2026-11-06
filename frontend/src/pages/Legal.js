import React from "react";
import { Link } from "react-router-dom";

// First drafts, written to match what the app actually does. Have them reviewed before launch,
// and set REACT_APP_CONTACT_EMAIL for the build so people have somewhere to write.
const LAST_UPDATED = "7 November 2026";
const CONTACT_EMAIL = process.env.REACT_APP_CONTACT_EMAIL;

function Contact() {
  return CONTACT_EMAIL
    ? <a href={`mailto:${CONTACT_EMAIL}`} className="font-bold underline">{CONTACT_EMAIL}</a>
    : <span>your teacher at School of Maths</span>;
}

function LegalPage({ title, children }) {
  return (
    <div className="min-h-screen classroom-bg p-4 sm:p-8">
      <article className="max-w-2xl mx-auto bg-white rounded-3xl border-[3px] border-[#1E293B] shadow-[6px_6px_0_#1E293B] p-6 sm:p-10 text-[#1E293B] space-y-4 text-sm leading-relaxed [&_h2]:font-head [&_h2]:font-bold [&_h2]:text-lg [&_h2]:pt-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1">
        <Link to="/" className="inline-flex min-h-11 items-center text-sm font-bold text-[#3E7CB1] hover:underline">← School of Maths</Link>
        <h1 className="font-head font-black text-3xl">{title}</h1>
        <p className="text-xs text-[#64748B]">Last updated {LAST_UPDATED}</p>
        {children}
      </article>
    </div>
  );
}

export function Privacy() {
  return (
    <LegalPage title="Privacy Policy">
      <p>School of Maths runs this app for its students and teachers. Many of our students are under 18, so we collect only what running classes needs.</p>
      <h2>What we collect</h2>
      <ul>
        <li><strong>Account:</strong> name, email, mobile number and password. Passwords are stored in scrambled form that nobody can read, including us.</li>
        <li><strong>Parent or guardian:</strong> name, mobile number and email, given when a student signs up.</li>
        <li><strong>Classes:</strong> your batches, test and practice answers, scores and time taken, and which class tests you attended.</li>
        <li><strong>Fees:</strong> the fee records your teacher enters for your batch. We don't collect card or bank details.</li>
        <li><strong>Technical:</strong> your network address, for security and to stop password guessing, and error reports with no personal details.</li>
      </ul>
      <h2>How we use it</h2>
      <p>To run tests, show you and your teacher your progress, keep fee records, and keep accounts secure. Notes you open show your name and email as a watermark, to discourage copying. We don't sell your data, show ads, or use it for anything else.</p>
      <h2>Who can see it</h2>
      <p>You, your batch's teachers and the School of Maths admin. Teachers use phone numbers to contact students and parents. Other students can't see them. These services store or carry data for us, under their own security terms:</p>
      <ul>
        <li>MongoDB Atlas (database, in India)</li>
        <li>DigitalOcean (app server, in India)</li>
        <li>Cloudflare (website delivery and file storage)</li>
        <li>Brevo (password-reset, consent and weekly report emails)</li>
        <li>Sentry (error reports)</li>
        <li>Google Gemini, only when a teacher imports questions from a question paper they upload. Student data isn't included.</li>
      </ul>
      <h2>Weekly reports to parents</h2>
      <p>Once a parent has agreed, they get a weekly email about their child's class tests: marks, class average, class rank, attendance and topics to work on. It never names other students or includes questions and answers. To stop these emails, contact <Contact />.</p>
      <h2>Children and parents</h2>
      <p>Every student needs a parent or guardian's agreement before they can use this app. We email the parent a link to agree, or the parent can sign a form at the centre. We save a record of the agreement: who it was sent to, when it was given, the wording agreed to, and the network address and browser used. Parents and guardians can withdraw their agreement, and can ask to see, correct or delete their child's data.</p>
      <h2>How long we keep it</h2>
      <p>While you're a student here, and until you ask us to delete it. Deleting removes your account, results and contact details straight away. We keep only anonymous proof that agreement was given: the dates and the version of the wording, with no name or contact details. Backups are overwritten within about 30 days.</p>
      <h2>Your rights</h2>
      <p>You can ask to see your data, correct it, delete it, or withdraw your agreement, and you can raise a complaint with us. Contact <Contact />.</p>
    </LegalPage>
  );
}

export function Terms() {
  return (
    <LegalPage title="Terms of Use">
      <p>By creating an account you agree to these terms. A student's parent or guardian must agree too, before the student can start.</p>
      <h2>Your account</h2>
      <ul>
        <li>Use your own real name and email, and keep your password private.</li>
        <li>Don't share your account or let anyone else take a test for you.</li>
      </ul>
      <h2>Tests</h2>
      <p>Class tests allow one attempt and have a time limit. If time runs out, your saved answers are submitted automatically. Please take tests honestly, on your own.</p>
      <h2>Notes and questions</h2>
      <p>Notes, questions and other material belong to School of Maths or its teachers. They're for your own study. Don't copy, share or sell them. Copies are watermarked with your name and email.</p>
      <h2>Teachers</h2>
      <p>Teacher accounts need admin approval. Upload only material you have the right to use, and use student data only for teaching.</p>
      <h2>Reports and ranks</h2>
      <p>Class averages and ranks count only the class tests your teacher sets. Practice doesn't count. A missed class test counts as 0 unless your teacher excuses it. Parents get a weekly report of these results.</p>
      <h2>Stopping access</h2>
      <p>We can disable or block an account that breaks these terms. You can ask us to close your account at any time.</p>
      <h2>Availability</h2>
      <p>We work to keep the app running, but it may sometimes be unavailable. If a problem affects a test, speak to your teacher, who can arrange a make-up.</p>
      <h2>Contact</h2>
      <p>Questions? Contact <Contact />. These terms follow the laws of India.</p>
    </LegalPage>
  );
}

# M02 — কুরআন বিভাগের Course, Batch ও Enrollment Workflow

`/admin/academic` কেবল `super_admin` ও `admin` role-এ দৃশ্যমান এবং server-side route-এ আবার যাচাই করা হয়। এখান থেকে কোনো technical configuration ছাড়াই form দিয়ে কুরআন বিভাগের `courses`, `course_levels`, `lessons` ও `batches` তৈরি হয়। Recorded lesson URL কেবল YouTube URL হতে পারে। Batch তৈরির সময় ঐচ্ছিক Teacher UID দিলে server Firebase custom claim থেকে Teacher role যাচাই করে।

Self-signup-এর সময় `users` profile-এর সঙ্গে `enrollments` collection-এ একটি `pending_approval` request তৈরি হয়। Admin approval-এর সময় একটি active batch নির্বাচন করা বাধ্যতামূলক; এক action-এ enrollment `active` হয় এবং user profile `active` হয়। Reject করলে enrollment `rejected` এবং profile `inactive` হয়। দুই ক্ষেত্রেই immutable audit log record তৈরি হয়। সকল list query সর্বোচ্চ ৫০টি document এবং status-filtered Firestore REST query ব্যবহার করে।

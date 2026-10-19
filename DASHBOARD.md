# E2E Dashboard — طريقة الرفع والتشغيل

صفحة على Vercel تختار منها تست واحد، أو ملف، أو أداة كاملة، أو كل التستات، وتدوس **Run**.
التستات بتشتغل على **GitHub Actions**، وكل تست وكل خطوة بتظهر في الصفحة وهي شغّالة، ومعاها النتيجة وسبب الفشل والـ trace.

```
المتصفح ──Run──▶ Vercel (الصفحة + api/) ──workflow_dispatch──▶ GitHub Actions
   ▲                     │  ▲                                        │
   └──── يعرض live ◀─────┘  └──────── reporters/dashboard.ts ◀───────┘
                     Upstash Redis (بيخزّن الأحداث)
```

| الملف | دوره |
| --- | --- |
| `public/` | الصفحة نفسها (HTML/CSS/JS من غير framework) |
| `api/` | الـ API على Vercel: الدخول، بدء run، المتابعة، الإلغاء، واستقبال الأحداث من CI |
| `reporters/dashboard.ts` | reporter جوه e2e بيبعت الأحداث للصفحة وقت التشغيل. مش بيشتغل غير في CI |
| `scripts/` | `build-catalog.mjs` (بيعمل قائمة التستات وقت الـ build) و`ci-*.mjs` (خطوات الـ CI) |
| `.github/workflows/e2e-dashboard.yml` | الـ job اللي بيشغّل التستات |
| `environments.json` | لينكات البيئات (dev / staging / prod / local) |

---

## جرّبه على جهازك الأول (من غير GitHub ولا Vercel)

```bash
npm run dashboard:local
```

افتح http://localhost:4321، والباسورد `local`.
- نفس الصفحة ونفس الـ API، بس زرار Run بيشغّل التستات على جهازك، وواحد ورا التاني.
- الـ output بتاع التست بيظهر في الصفحة وفي التيرمنال مع بعض.
- **Local build** بيشغّل على `localhost:4200`: لو `npm start` شغّال في فولدر الأبلكيشن بيستخدمه، ولو مش شغّال بيشغّله.
- البيانات بتتمسح لما تقفل السيرفر بـ Ctrl+C.

---

## ١. املأ لينكات البيئات

في `environments.json` حط الـ `url` لكل بيئة. البيئة اللي الـ url بتاعها فاضي هتظهر في الصفحة disabled.
- `confirm: true` على prod معناه إن الصفحة هتسأل قبل ما تشغّل عليه.
- `local` مش محتاجة لينك. الـ CI بيبني الأبلكيشن من الريبو بتاعه ويشغّله (شوف الخطوة ٥).

## ٢. ارفع فولدر E2E على GitHub

```bash
cd E2E
git init && git add . && git commit -m "E2E tests + dashboard"
git branch -M main
git remote add origin https://github.com/<you>/<repo>.git
git push -u origin main
```

> ملف `.env` في `.gitignore`، فالمفاتيح والباسوردات مش هتترفع. **خلّي الريبو private.**
> الـ workflow لازم يكون على الـ branch الأساسي (main) عشان Vercel يقدر يشغّله.

## ٣. GitHub: الـ secrets والـ variables

من الريبو: **Settings → Secrets and variables → Actions**.

**Secrets:**

| الاسم | القيمة |
| --- | --- |
| `OPENROUTER_API_KEY` | نفس اللي في `.env` |
| `E2E_USER_MEMBER_PASSWORD` | باسورد حساب التست (نفس اللي في `.env`) |
| `DASHBOARD_INGEST_TOKEN` | نص عشوائي طويل. ولّده بـ `node -e "console.log(crypto.randomUUID()+crypto.randomUUID())"`، ونفس القيمة هتتحط في Vercel |
| `E2E_USER_MEMBER_PASSWORD_PROD` … *(اختياري)* | لو بيئة معيّنة ليها حساب مختلف: `_DEV` / `_STAGING` / `_PROD` / `_LOCAL` |

**Variables:**

| الاسم | القيمة |
| --- | --- |
| `DASHBOARD_URL` | لينك Vercel. هتحطه بعد الخطوة ٤ |
| `E2E_USER_MEMBER_USERNAME` … *(اختياري)* | إيميل حساب التست لو مش `ali@gmail.com`. وفيه منه نسخة لكل بيئة: `_PROD` إلخ |

## ٤. Vercel

1. **Add New → Project** واختار الريبو. الإعدادات بتتقري من `vercel.json`، فمتغيّرش حاجة.
2. **Storage → Marketplace → Upstash (Redis)**: اعمل database مجانية واربطها بالـ project. ده بيضيف `KV_REST_API_URL` و`KV_REST_API_TOKEN` لوحده.
3. **Settings → Environment Variables**:

| الاسم | القيمة |
| --- | --- |
| `DASHBOARD_PASSWORD` | باسورد الدخول للصفحة، وبيتشارك مع الفريق |
| `DASHBOARD_INGEST_TOKEN` | **نفس** القيمة اللي في GitHub |
| `GITHUB_REPO` | `<owner>/<repo>` |
| `GITHUB_TOKEN` | Fine-grained token على الريبو ده بس، وصلاحياته: **Actions: Read and write** و**Contents: Read**. اعمله من GitHub → Settings → Developer settings → Fine-grained tokens |
| `GITHUB_REF_NAME` *(اختياري)* | الـ branch اللي الـ workflow يشتغل منه. الافتراضي `main` |

4. اعمل **Redeploy** عشان الـ variables تتطبّق. بعدها خد لينك الـ production وحطه في GitHub كـ `DASHBOARD_URL` (الخطوة ٣).

## ٥. *(اختياري)* بيئة local

عشان الـ CI يبني الأبلكيشن نفسه ويشغّله:
- **GitHub variable:** `APP_REPO` = `<owner>/<app-repo>`.
- **GitHub variable (اختياري):** `APP_REF` = الـ branch، والافتراضي `main`.
- **GitHub secret:** `APP_REPO_TOKEN` = token عنده Contents: Read على ريبو الأبلكيشن.

الأبلكيشن بيشتغل بالـ development configuration، يعني بيكلّم dev-api.

## ٦. الاستخدام

- **Run all:** بيشغّل كل التستات. **Run selected:** بيشغّل اللي معلّم عليه. **▶ Run** جنب أي أداة أو ملف أو تست بيشغّله لوحده.
- **Skip AI-agent tests:** بيستبعد التستات اللي عليها `#agent`، لأنها بتستهلك من حد الموديل اليومي.
- صفحة الـ run بتتحدّث كل ثانيتين وبتعرض:
  - التقدّم، وعدد اللي passed وfailed.
  - كل تست وخطواته، بالوقت والخطأ.
  - الـ trace الكامل للتست اللي فشل.
  - لينك GitHub Actions log، ولينك تحميل النتايج.
  - زرار Re-run failed، وزرار Cancel.
- أول تست بيبدأ بعد دقيقة لـ ٣ تقريبًا (تثبيت المتصفح والـ dependencies)، وبيتأخر أكتر في local عشان بيبني الأبلكيشن.

## ملاحظات

- **التشغيل من جهازك:** `npx e2e run` شغّال زي ما هو. الـ reporter مش بيبعت حاجة غير لما الـ CI يحدّد `DASHBOARD_URL`.
- **التستات اللي بتستخدم الـ agent:** في CI بتستخدم `.e2e/cache` (بيتحفظ بين الرنز لكل بيئة)، فلما الخطوات بتتكرر من غير تغيير مش بتكلّم الموديل.
- **التشغيل على prod:** بعض التستات بتعمل login وبتملا forms حقيقية. استخدم حساب تست مخصّص لـ prod.
- **الرنز القديمة:** بتتمسح من Redis تلقائيًا بعد ٣٠ يوم.

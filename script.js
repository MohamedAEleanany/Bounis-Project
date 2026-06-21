let allResults = [];
let isVerticalView = false;

// عند تحميل الصفحة، فحص إذا كان هناك نتائج محفوظة وجاء من صفحة أخرى
window.addEventListener('DOMContentLoaded', function () {
    const urlParams = new URLSearchParams(window.location.search);
    const returnFromPage = urlParams.get('return');

    if (returnFromPage) {
        const savedResults = safeStorage.getItem('examStatistics');
        if (savedResults) {
            try {
                allResults = JSON.parse(savedResults);
                if (allResults.length > 0) {
                    renderResults(allResults);
                    document.getElementById('upload-view').style.display = 'none';
                    document.getElementById('results-view').style.display = 'block';
                }
            } catch (error) {
                console.error('Error loading saved results:', error);
            }
        }
    }
});

document.getElementById('analysis-form').addEventListener('submit', async function (e) {
    e.preventDefault();

    const fileInput = document.getElementById('file-input');
    const maxScoreInput = document.getElementById('max-score');
    const academicYearInput = document.getElementById('academic-year');
    const maxCurveInput = document.getElementById('max-curve');

    const submitBtn = document.getElementById('submit-btn');

    const files = Array.from(fileInput.files);
    const maxScore = parseFloat(maxScoreInput.value);
    const academicYear = academicYearInput.value;
    const maxCurve = parseInt(maxCurveInput.value) || 10;
    const controlLevel = ''; // تم إزالة هذا الحقل
    const controlHeadName = ''; // تم إزالة هذا الحقل

    if (files.length === 0 || isNaN(maxScore)) {
        alert('يرجى اختيار الملفات والدرجة');
        return;
    }

    submitBtn.disabled = true;
    submitBtn.innerText = 'جاري الحساب...';

    try {
        const results = [];
        for (const file of files) {
            const result = await processFile(file, maxScore, academicYear, maxCurve);
            // إضافة بيانات الكنترول
            result.controlLevel = controlLevel;
            result.controlHeadName = controlHeadName;
            results.push(result);
        }



        allResults = results;
        // حفظ النتائج في localStorage
        safeStorage.setItem('examStatistics', JSON.stringify(allResults));

        // معالجة بيانات التخلفات إذا كانت الدرجة 100
        if (maxScore === 100) {
            // قراءة السنة الدراسية من القائمة المنسدلة
            const academicYearSelect = document.getElementById('academic-year');
            const selectedAcademicYear = academicYearSelect ? academicYearSelect.value : '2025-2026';

            processFailureStatistics(files, selectedAcademicYear);
            processAccountingFailureStatistics(files, selectedAcademicYear);
            // إظهار زر نسب نجاح التخلفات
            const failureBtn = document.getElementById('failure-stats-btn');
            if (failureBtn) failureBtn.style.display = 'inline-block';
            // إظهار زر نسب نجاح تخلفات المحاسبة
            const accountingFailureBtn = document.getElementById('accounting-failure-stats-btn');
            if (accountingFailureBtn) accountingFailureBtn.style.display = 'inline-block';
        } else {
            // إخفاء الأزرار إذا لم تكن الدرجة 100
            const failureBtn = document.getElementById('failure-stats-btn');
            if (failureBtn) failureBtn.style.display = 'none';
            const accountingFailureBtn = document.getElementById('accounting-failure-stats-btn');
            if (accountingFailureBtn) accountingFailureBtn.style.display = 'none';
        }

        renderResults(allResults);


        document.getElementById('upload-view').style.display = 'none';
        document.getElementById('results-view').style.display = 'block';

    } catch (error) {
        console.error(error);
        alert('حدث خطأ أثناء معالجة الملفات: ' + error.message);
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerText = '+ حساب النتائج';
    }
});

function processFile(file, maxScore, academicYear, maxCurve = 10) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = function (e) {
            try {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                const firstSheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[firstSheetName];


                if (worksheet['!ref']) {
                    const range = XLSX.utils.decode_range(worksheet['!ref']);
                    range.s.c = 0; // Start Column A
                    range.s.r = 0; // Start Row 1
                    worksheet['!ref'] = XLSX.utils.encode_range(range);
                }

                // Convert to array of arrays
                let rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: false }); // raw:false ensures values are strings if formatted

                // البحث عن اسم المادة في الصفوف الأولى
                let courseName = "غير محدد";
                for (let i = 1; i < Math.min(rows.length, 5); i++) {
                    if (rows[i] && rows[i][5] !== undefined) {
                        const val = String(rows[i][5]).trim();
                        if (val !== '' && isNaN(parseFloat(val))) {
                            courseName = val;
                            break;
                        }
                    }
                }
                // (تمت إزالة كود القص القديم - الآن نعتمد على الحلقة أدناه لتجاهل العنوان)

                // قراءة درجة البونص من العمود J (index 9)
                // البحث عن أول رقم صحيح في العمود (تجاهل كلمة "غياب" أو القيم الفارغة)
                let bonusGrade = 0;
                for (let i = 1; i < Math.min(rows.length, 20); i++) { // البحث في أول 20 صف
                    if (rows[i] && rows[i][9] !== undefined) {
                        const bonusValue = String(rows[i][9]).trim();
                        if (bonusValue !== '' && !isNaN(parseFloat(bonusValue))) {
                            bonusGrade = parseFloat(bonusValue);
                            console.log(`درجة البونص من الخلية J${i + 1}:`, bonusGrade);
                            break; // وجدنا أول رقم صحيح، نتوقف
                        }
                    }
                }

                // Process Scores - نبدأ من الصف الثاني (index 1) لتجاهل الـ header
                let totalStudents = 0;
                let scores = [];
                let studentNames = [];

                console.log('=== بدء معالجة الصفوف ===');
                console.log('عدد الصفوف الكلي (مع الـ header):', rows.length);
                console.log('سنبدأ من الصف رقم 1 (تجاهل الـ header في الصف 0)');

                // نبدأ من index 1 لتجاهل الـ header
                for (let rowIndex = 1; rowIndex < rows.length; rowIndex++) {
                    const row = rows[rowIndex];

                    // تجاهل الصفوف الفارغة تماماً
                    if (!row || row.length === 0) {
                        console.log(`صف ${rowIndex}: فارغ تماماً - تم التجاهل`);
                        continue;
                    }

                    // كل صف غير فارغ = طالب
                    totalStudents++;

                    // فحص العمود K (index 10)
                    const cellValue = row[10];

                    if (cellValue === undefined || cellValue === null) {
                        // الخلية غير موجودة = غياب
                        console.log(`صف ${rowIndex}: طالب #${totalStudents} - العمود K فارغ → غياب`);
                        continue;
                    }

                    // عمل trim للقيمة
                    const trimmedValue = String(cellValue).trim();

                    console.log(`صف ${rowIndex}: طالب #${totalStudents} - القيمة في K: "${trimmedValue}"`);

                    // فحص إذا كانت القيمة رقم
                    if (trimmedValue !== '' && !isNaN(parseFloat(trimmedValue))) {
                        // رقم صحيح = حضور
                        const score = parseFloat(trimmedValue);
                        scores.push(score);

                        // استخراج اسم الطالب من العمود B (index 1)
                        const studentName = row[1] ? String(row[1]).trim() : `طالب ${scores.length} `;
                        studentNames.push(studentName);

                        console.log(`  ✅ حضور - الاسم: ${studentName} - الدرجة: ${score} `);
                    } else {
                        // "غياب" أو أي نص آخر أو فارغ = غياب
                        console.log(`  ❌ غياب - القيمة: "${trimmedValue}"`);
                    }
                }

                console.log('=== نهاية المعالجة ===');
                console.log('إجمالي الطلاب:', totalStudents);
                console.log('عدد الحضور (لديهم درجات):', scores.length);
                console.log('عدد الغياب:', totalStudents - scores.length);

                const attendingStudents = scores.length;
                const absentStudents = totalStudents - attendingStudents;
                const passThreshold = maxScore / 2;


                const curveData = [];
                for (let added = 0; added <= maxCurve; added++) {
                    let passedCount = 0;
                    scores.forEach(score => {
                        const newScore = score + added;

                        if (parseFloat(newScore.toFixed(2)) >= parseFloat(passThreshold.toFixed(2))) {
                            passedCount++;
                        }
                    });

                    const percentage = attendingStudents > 0 ? (passedCount / attendingStudents) * 100 : 0;

                    curveData.push({
                        added: added,
                        passed: passedCount,
                        percentage: percentage
                    });

                    if (percentage >= 100) {
                        break;
                    }
                }

                const currentPassStats = curveData[0];

                // Course Name Validations
                if (courseName && courseName !== "غير محدد") {
                    courseName = courseName + ' ' + academicYear;
                } else {
                    courseName = "غير محدد " + academicYear;
                }

                if (maxScore === 100) {
                    courseName = 'تخلف - ' + courseName;
                } else if (maxScore === 15 || maxScore === 20) {
                    courseName = 'ميد ترم - ' + courseName;
                } else if (maxScore === 60 || maxScore === 65 || maxScore === 70 || maxScore === 75 || maxScore === 80) {
                    courseName = 'فاينال - ' + courseName;
                }

                resolve({
                    courseName,
                    maxScore,
                    passThreshold,
                    totalStudents,
                    attendingStudents,
                    absentStudents,
                    currentPassStats,
                    curveData,
                    scores, // Return scores for re-calculation
                    studentNames, // Return student names
                    bonusGrade // Return bonus grade from K2
                });

            } catch (err) {
                reject(err);
            }
        };

        reader.onerror = (err) => reject(err);
        reader.readAsArrayBuffer(file);
    });
}

function renderResults(results) {
    const container = document.getElementById('results-container');
    container.innerHTML = '';

    // إزالة كلاسات الطباعة القديمة
    container.classList.remove('print-2-per-page');

    let currentPageLoad = 0;
    const PAGE_CAPACITY = 3.5; // سعة عالية لضمان مادتين

    results.forEach((result, index) => {
        let element;
        if (isVerticalView) {
            element = createVerticalResultElement(result, index);
        } else {
            element = createResultElement(result, index);
        }

        // حساب "تكلفة" المادة في الصفحة
        // المادة العادية تكلف 1، مادة 60 تكلف 1.5 (لأنها أطول)
        const itemCost = (result.maxScore === 60) ? 1.5 : 1.0;

        if (currentPageLoad + itemCost > PAGE_CAPACITY + 0.1) {
            // الصفحة امتلأت، ابدأ صفحة جديدة قبل هذا العنصر
            element.style.pageBreakBefore = 'always';
            element.style.breakBefore = 'page';
            element.style.marginTop = '0';
            currentPageLoad = itemCost;
        } else {
            currentPageLoad += itemCost;
        }

        container.appendChild(element);
    });
}

function toggleViewMode() {
    isVerticalView = !isVerticalView;
    renderResults(allResults);
}

function createVerticalResultElement(result, index) {
    const section = document.createElement('div');
    section.className = 'result-section';
    section.id = `result-section-${index}`;

    if (result.maxScore === 60) {
        section.classList.add('exam-60');
    }
    // دالة مساعدة لبناء الجدول (محوّر: الصفوف هي البيانات والأعمدة هي الدرجات المضافة)
    // دالة مساعدة لبناء الجدول (محوّر: الصفوف هي البيانات والأعمدة هي الدرجات المضافة)
    function buildDetailedTable(title, passThreshold, curveDataInput) {
        // بناء رأس الجدول (الدرجات المضافة)
        let headerHtml = '<th style="vertical-align: middle; background-color: #d3d3d3; color: #000; -webkit-print-color-adjust: exact; print-color-adjust: exact;">البيان</th>';
        curveDataInput.forEach(row => {
            const label = row.added === 0 ? 'بدون إضافة' : `بعد +${row.added}`;
            headerHtml += `<th style="vertical-align: middle; background-color: #d3d3d3; -webkit-print-color-adjust: exact; print-color-adjust: exact;">${label}</th>`;
        });

        // تحضير صفوف البيانات
        let totalHtml = '<td class="fw-bold fs-6" style="background-color: #d3d3d3; -webkit-print-color-adjust: exact; print-color-adjust: exact;">إجمالي الطلاب</td>';
        let attendanceHtml = '<td class="fw-bold fs-6" style="background-color: #d3d3d3; -webkit-print-color-adjust: exact; print-color-adjust: exact;">الحضور</td>';
        let absenceHtml = '<td class="fw-bold fs-6" style="background-color: #d3d3d3; -webkit-print-color-adjust: exact; print-color-adjust: exact;">الغياب</td>';
        let passedHtml = '<td class="fw-bold fs-6" style="background-color: #d3d3d3; -webkit-print-color-adjust: exact; print-color-adjust: exact;">عدد الناجحين</td>';
        let percentageHtml = '<td class="fw-bold fs-6" style="background-color: #d3d3d3; -webkit-print-color-adjust: exact; print-color-adjust: exact;">نسبة النجاح</td>';

        curveDataInput.forEach(row => {
            totalHtml += `<td class="fw-bold fs-6">${result.totalStudents}</td>`;
            attendanceHtml += `<td class="fw-bold fs-6 text-success">${result.attendingStudents}</td>`;
            absenceHtml += `<td class="fw-bold fs-6 text-danger">${result.absentStudents}</td>`;
            passedHtml += `<td class="fw-bold fs-6">${row.passed}</td>`;
            percentageHtml += `<td class="fw-bold fs-6">${row.percentage.toFixed(3)} %</td>`;
        });

        let html = `
        <div class="table-container mt-3 table-responsive">
            <h6 class="text-center mb-2 fw-bold text-primary">${title} - ${passThreshold} درجة</h6>
            <table class="table table-bordered text-center align-middle" style="border-color: #dee2e6;">
                <thead>
                    <tr>
                        ${headerHtml}
                    </tr>
                </thead>
                <tbody>
                    <tr>${totalHtml}</tr>
                    <tr>${attendanceHtml}</tr>
                    <tr>${absenceHtml}</tr>
                    <tr>${passedHtml}</tr>
                    <tr>${percentageHtml}</tr>
                </tbody>
            </table>
        </div>
        `;
        return html;
    }

    // --- جدول 50% ---
    const table50Html = buildDetailedTable('إحصائيات النجاح (50%)', result.passThreshold, result.curveData);

    // --- جدول 60% (إذا وجد) ---
    let table60Html = '';
    if (result.maxScore === 60) {
        const threshold60 = result.maxScore * 0.6; // 36
        const maxCurve = 10; // استخدام 10 دائماً لجدول 60%
        let curveData60 = [];

        for (let added = 0; added <= maxCurve; added++) {
            let passedCount = 0;
            result.scores.forEach(score => {
                if ((score + added) >= threshold60) passedCount++;
            });
            const percentage = result.attendingStudents > 0 ? (passedCount / result.attendingStudents) * 100 : 0;

            curveData60.push({
                added: added,
                passed: passedCount,
                percentage: percentage
            });

            if (percentage >= 100) break;
        }

        console.log('curveData60 في renderResults:', curveData60);
        console.log('عدد العناصر:', curveData60.length);
        table60Html = buildDetailedTable('إحصائيات النجاح (60%)', threshold60, curveData60);
    }

    const html = `
            <div class="text-center mb-0 position-relative">
                <h4 class="mb-0 course-title" id="course-title-${index}">${result.courseName}</h4>
                 <div class="no-print mt-2">
                    <button class="btn btn-sm btn-outline-info me-1" onclick="toggleTitleEdit(${index})">✏️ تعديل العنوان</button>
                    <button class="btn btn-sm btn-outline-secondary" onclick="toggleEdit(${index})">⚙️ تحديث الدرجات</button>
                    <button class="btn btn-sm btn-outline-danger me-1" onclick="removeSubject(${index})">🗑️ حذف</button>
                </div>
                <div id="title-edit-box-${index}" class="no-print mt-2 d-none p-2 bg-light border rounded" style="max-width: 450px; margin: 0 auto;">
                    <div class="input-group input-group-sm">
                        <span class="input-group-text">العنوان</span>
                        <input type="text" id="title-input-${index}" class="form-control" value="${result.courseName}">
                        <button class="btn btn-success" onclick="updateTitle(${index})">حفظ</button>
                    </div>
                </div>
                <div id="edit-box-${index}" class="no-print mt-2 d-none p-2 bg-light border rounded" style="max-width: 300px; margin: 0 auto;">
                    <div class="input-group input-group-sm">
                        <span class="input-group-text">عدد الدرجات المضافة</span>
                        <input type="number" id="edit-input-${index}" class="form-control" value="${result.curveData.length > 0 ? result.curveData[result.curveData.length - 1].added : 10}" min="0" max="50">
                        <button class="btn btn-primary" onclick="updateCurve(${index})">تحديث</button>
                    </div>
                </div>
            </div>

            <div class="row">
                <div class="col-12 p-0"> <!-- إزالة الـ padding -->
                    ${table50Html}
                </div>
                ${result.maxScore === 60 ? `<div class="col-12 mt-0 p-0">${table60Html}</div>` : ''} <!-- إزالة الهوامش تماماً -->
            </div>
    `;

    section.innerHTML = html;
    return section;
}

function createResultElement(result, index) {
    const section = document.createElement('div');
    section.className = 'result-section';
    section.id = `result-section-${index}`;

    // إضافة class خاص لدرجة 60
    if (result.maxScore === 60) {
        section.classList.add('exam-60');
    }

    // حساب نسبة النجاح عند 60%
    const passThreshold60 = result.maxScore * 0.6;
    let passedAt60 = 0;
    result.scores.forEach(score => {
        if (parseFloat(score.toFixed(2)) >= parseFloat(passThreshold60.toFixed(2))) {
            passedAt60++;
        }
    });
    const percentage60 = result.attendingStudents > 0 ? (passedAt60 / result.attendingStudents) * 100 : 0;

    let curveHeaderHtml = '';
    result.curveData.forEach(row => {
        const label = row.added === 0 ? 'بدون إضافة' : `بعد +${row.added}`;
        curveHeaderHtml += `<th style="vertical-align: middle;">${label}</th>`;
    });


    let curvePassedHtml = '';
    result.curveData.forEach(row => {
        curvePassedHtml += `<td class="fw-bold fs-6">${row.passed}</td>`;
    });


    let curvePercentageHtml = '';
    result.curveData.forEach(row => {
        curvePercentageHtml += `<td class="fw-bold fs-6">${row.percentage.toFixed(3)} %</td>`;
    });

    // إنشاء جدول واحد فقط عند 60%
    let additionalTablesHtml = '';
    if (result.maxScore === 60) {
        const currentPercent = 60;
        const currentThreshold = result.maxScore * 0.6;

        let curveData60 = [];
        const maxCurve = 10; // استخدام 10 دائماً لجدول 60%
        for (let added = 0; added <= maxCurve; added++) {
            let passedCount = 0;
            result.scores.forEach(score => {
                const newScore = score + added;
                if (parseFloat(newScore.toFixed(2)) >= parseFloat(currentThreshold.toFixed(2))) {
                    passedCount++;
                }
            });

            const percentage = result.attendingStudents > 0 ? (passedCount / result.attendingStudents) * 100 : 0;
            curveData60.push({
                added: added,
                passed: passedCount,
                percentage: percentage
            });

            if (percentage >= 100) break;
        }

        let headerHtml60 = '';
        curveData60.forEach(row => {
            const label = row.added === 0 ? 'بدون إضافة' : `بعد +${row.added}`;
            headerHtml60 += `<th style="vertical-align: middle;">${label}</th>`;
        });

        let passedHtml60 = '';
        curveData60.forEach(row => {
            passedHtml60 += `<td class="fw-bold fs-6">${row.passed}</td>`;
        });

        let percentageHtml60 = '';
        curveData60.forEach(row => {
            percentageHtml60 += `<td class="fw-bold fs-6">${row.percentage.toFixed(3)} %</td>`;
        });

        additionalTablesHtml = `
            <div class="table-container mt-3">
                <h6 class="text-center mb-2">نسبة النجاح عند ${currentPercent}% (${parseFloat(currentThreshold.toFixed(2))} درجة)</h6>
                <div class="table-responsive">
                    <table class="table table-bordered text-center" style="border-color: #dee2e6;">
                        <thead>
                            <tr>
                                <th style="width: 20%; vertical-align: middle;">الدرجات المضافة</th>
                                ${headerHtml60}
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td class="fw-bold fs-6 bg-gray-print">عدد الناجحين</td>
                                ${passedHtml60}
                            </tr>
                            <tr>
                                <td class="fw-bold fs-6 bg-gray-print">نسبة النجاح</td>
                                ${percentageHtml60}
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>
    `;
    }

    const html = `
            <div class="text-center mb-3 position-relative">
                <h4 class="mb-0 course-title" id="course-title-${index}">${result.courseName}</h4>
                 <div class="no-print mt-2">
                    <button class="btn btn-sm btn-outline-info me-1" onclick="toggleTitleEdit(${index})">✏️ تعديل العنوان</button>
                    <button class="btn btn-sm btn-outline-primary" onclick="toggleMaxScoreEdit(${index})">📝 تعديل درجة الامتحان</button>
                    <button class="btn btn-sm btn-outline-secondary" onclick="toggleEdit(${index})">⚙️ تحديث الدرجات</button>
                    <button class="btn btn-sm btn-outline-danger me-1" onclick="removeSubject(${index})">🗑️ حذف</button>
                </div>
                <div id="title-edit-box-${index}" class="no-print mt-2 d-none p-2 bg-light border rounded" style="max-width: 450px; margin: 0 auto;">
                    <div class="input-group input-group-sm">
                        <span class="input-group-text">العنوان</span>
                        <input type="text" id="title-input-${index}" class="form-control" value="${result.courseName}">
                        <button class="btn btn-success" onclick="updateTitle(${index})">حفظ</button>
                    </div>
                </div>
                <div id="maxscore-edit-box-${index}" class="no-print mt-2 d-none p-2 bg-light border rounded" style="max-width: 350px; margin: 0 auto;">
                    <div class="input-group input-group-sm">
                        <span class="input-group-text">درجة الامتحان</span>
                        <input type="number" id="maxscore-input-${index}" class="form-control" value="${result.maxScore}" min="1" max="200">
                        <button class="btn btn-success" onclick="updateMaxScore(${index})">تحديث</button>
                    </div>
                </div>
                <div id="edit-box-${index}" class="no-print mt-2 d-none p-2 bg-light border rounded" style="max-width: 300px; margin: 0 auto;">
                    <div class="input-group input-group-sm">
                        <span class="input-group-text">عدد الدرجات المضافة</span>
                        <input type="number" id="edit-input-${index}" class="form-control" value="${result.curveData.length > 0 ? result.curveData[result.curveData.length - 1].added : 10}" min="0" max="50">
                        <button class="btn btn-primary" onclick="updateCurve(${index})">تحديث</button>
                    </div>
                </div>
            </div>


            <div class="info-section no-print">
                <div class="row text-center">
                    <div class="${result.maxScore === 60 ? 'col-4' : 'col-6'}">
                        <div class="info-label">درجة الامتحان</div>
                        <div class="info-value">${result.maxScore}</div>
                    </div>
                    <div class="${result.maxScore === 60 ? 'col-4' : 'col-6'}">
                        <div class="info-label">درجة النجاح (%50)</div>
                        <div class="info-value">${result.passThreshold}</div>
                    </div>
                    ${result.maxScore === 60 ? `
                    <div class="col-4">
                        <div class="info-label">درجة النجاح (%60)</div>
                        <div class="info-value">${passThreshold60.toFixed(1)}</div>
                    </div>
                    ` : ''}
                </div>
            </div>


            <div class="table-container mb-1">
                <div class="table-responsive">
                    <table class="table table-sm table-bordered" style="font-size: 0.9rem;">
                        <thead class="table-light">
                            <tr>
                                <th rowspan="2" style="vertical-align: middle;">إجمالي الطلاب</th>
                                <th rowspan="2" style="vertical-align: middle;">الحضور</th>
                                <th rowspan="2" style="vertical-align: middle;">الغياب</th>
                                <th colspan="2">إحصائيات النجاح (50%)</th>
                                ${result.maxScore === 60 ? '<th colspan="2">إحصائيات النجاح (60%)</th>' : ''}
                            </tr>
                            <tr>
                                <th>عدد الناجحين</th>
                                <th>نسبة النجاح</th>
                                ${result.maxScore === 60 ? `
                                <th>عدد الناجحين</th>
                                <th>نسبة النجاح</th>
                                ` : ''}
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td>${result.totalStudents}</td>
                                <td>${result.attendingStudents}</td>
                                <td>${result.absentStudents}</td>
                                <td>${result.currentPassStats.passed}</td>
                                <td>${result.currentPassStats.percentage.toFixed(3)} %</td>
                                ${result.maxScore === 60 ? `
                                <td>${passedAt60}</td>
                                <td>${percentage60.toFixed(3)} %</td>
                                ` : ''}
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>

            <div class="table-container">
                <h6 class="text-center mb-2">نسبة النجاح عند 50% (${parseFloat(result.passThreshold.toFixed(2))} درجة)</h6>
                <div class="table-responsive">
                    <table class="table table-bordered text-center" style="border-color: #dee2e6;">
                        <thead>
                            <tr>
                                <th style="width: 20%; vertical-align: middle;">الدرجات المضافة</th>
                                ${curveHeaderHtml}
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td class="fw-bold fs-6 bg-gray-print">عدد الناجحين</td>
                                ${curvePassedHtml}
                            </tr>
                            <tr>
                                <td class="fw-bold fs-6 bg-gray-print">نسبة النجاح</td>
                                ${curvePercentageHtml}
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>

            ${additionalTablesHtml}
`;

    section.innerHTML = html;
    return section;
}

function calculateCurveData(scores, passThreshold, attendingStudents, maxCurve) {
    const curveData = [];
    for (let added = 0; added <= maxCurve; added++) {
        let passedCount = 0;
        scores.forEach(score => {
            const newScore = score + added;
            if (parseFloat(newScore.toFixed(2)) >= parseFloat(passThreshold.toFixed(2))) {
                passedCount++;
            }
        });

        const percentage = attendingStudents > 0 ? (passedCount / attendingStudents) * 100 : 0;

        curveData.push({
            added: added,
            passed: passedCount,
            percentage: percentage
        });

        if (percentage >= 100) {
            break;
        }
    }
    return curveData;
}

function toggleTitleEdit(index) {
    const box = document.getElementById(`title-edit-box-${index}`);
    box.classList.toggle('d-none');
}

function updateTitle(index) {
    const input = document.getElementById(`title-input-${index}`);
    const newTitle = input.value.trim();

    if (!newTitle) {
        alert('يرجى إدخال عنوان صحيح');
        return;
    }

    // Update the data
    allResults[index].courseName = newTitle;

    // Update the displayed h4 in place (no full re-render needed)
    const titleEl = document.getElementById(`course-title-${index}`);
    if (titleEl) titleEl.textContent = newTitle;

    // Also update the input value in case user edits again
    input.value = newTitle;

    // Hide the edit box
    document.getElementById(`title-edit-box-${index}`).classList.add('d-none');

    // Persist to localStorage
    safeStorage.setItem('examStatistics', JSON.stringify(allResults));
}

function toggleEdit(index) {
    const box = document.getElementById(`edit-box-${index}`);
    box.classList.toggle('d-none');
}

function updateCurve(index) {
    const input = document.getElementById(`edit-input-${index}`);
    const newMax = parseInt(input.value);

    if (isNaN(newMax) || newMax < 0) return;

    // Recalculate
    const result = allResults[index];
    result.curveData = calculateCurveData(result.scores, result.passThreshold, result.attendingStudents, newMax);

    // Update current stats (pass stats at +0 didn't change, but consistent object update)
    result.currentPassStats = result.curveData[0];

    // Re-render only this section
    const oldSection = document.getElementById(`result-section-${index}`);
    const newSection = createResultElement(result, index);
    oldSection.replaceWith(newSection);
}

function toggleMaxScoreEdit(index) {
    const box = document.getElementById(`maxscore-edit-box-${index}`);
    box.classList.toggle('d-none');
}

function updateMaxScore(index) {
    const input = document.getElementById(`maxscore-input-${index}`);
    const newMaxScore = parseInt(input.value);

    if (isNaN(newMaxScore) || newMaxScore < 1) {
        alert('الرجاء إدخال درجة صحيحة');
        return;
    }

    // تحديث البيانات
    const result = allResults[index];
    result.maxScore = newMaxScore;
    result.passThreshold = newMaxScore * 0.5; // إعادة حساب درجة النجاح (50%)

    // إعادة حساب curveData بناءً على الدرجة الجديدة
    const maxCurve = result.curveData.length > 0 ? result.curveData[result.curveData.length - 1].added : 10;
    result.curveData = calculateCurveData(result.scores, result.passThreshold, result.attendingStudents, maxCurve);
    result.currentPassStats = result.curveData[0];

    // إعادة رسم القسم
    const oldSection = document.getElementById(`result-section-${index}`);
    const newSection = createResultElement(result, index);
    oldSection.replaceWith(newSection);

    // حفظ التغييرات في localStorage
    safeStorage.setItem('examStatistics', JSON.stringify(allResults));
}

function removeSubject(index) {
    if (confirm('هل أنت متأكد من حذف هذه المادة؟')) {
        allResults.splice(index, 1); // حذف العنصر من المصفوفة
        renderResults(allResults);   // إعادة رسم النتائج

        // لو مفيش نتائج، نرجع لصفحة الرفع
        if (allResults.length === 0) {
            document.getElementById('upload-view').style.display = 'block';
            document.getElementById('results-view').style.display = 'none';
        }
    }
}

function viewStatistics() {
    // حفظ البيانات في localStorage
    safeStorage.setItem('examStatistics', JSON.stringify(allResults));
    // الانتقال لصفحة الإحصائيات
    window.location.href = 'statistics.html';
}

function viewStudentGrades() {
    // حفظ البيانات في localStorage
    safeStorage.setItem('examStatistics', JSON.stringify(allResults));
    // الانتقال لصفحة درجات الطلاب
    window.location.href = 'students-grades.html';
}

function viewBonusAppliedStatistics() {
    // حفظ البيانات في localStorage
    safeStorage.setItem('examStatistics', JSON.stringify(allResults));
    // الانتقال لصفحة إحصائيات البونص المطبق
    window.location.href = 'bonus-applied-statistics.html';
}

function resetAndAnalyzeNew() {
    // مسح البيانات المحفوظة
    safeStorage.removeItem('examStatistics');
    safeStorage.removeItem('failureStatistics');
    safeStorage.removeItem('accountingFailureStatistics');
    allResults = [];

    // إعادة تحميل الصفحة بالكامل لضمان مسح كل شيء
    window.location.href = 'index.html';
}

async function processFailureStatistics(files, selectedAcademicYear = '2025-2026') {
    try {
        const allResults = []; // مصفوفة لحفظ نتائج كل فرقة في كل ملف

        for (const file of files) {
            const data = await file.arrayBuffer();
            const workbook = XLSX.read(data, { type: 'array' });
            const firstSheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[firstSheetName];

            if (worksheet['!ref']) {
                const range = XLSX.utils.decode_range(worksheet['!ref']);
                range.s.c = 0;
                range.s.r = 0;
                worksheet['!ref'] = XLSX.utils.encode_range(range);
            }

            let rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: false });

            // قراءة اسم المادة من العمود F (index 5) في الصف الثاني
            let courseName = 'غير محدد';

            // محاولة العثور على اسم المادة في العمود F (الصف الثاني)
            if (rows.length > 1 && rows[1] && rows[1][5]) {
                courseName = String(rows[1][5]).trim();
            }

            // استخدام السنة الدراسية المُمررة من index.html
            const academicYear = selectedAcademicYear;

            // إضافة بادئة "تخلف - " والسنة الدراسية إلى اسم المادة
            courseName = `تخلف - ${courseName} ${academicYear}`;

            // إحصائيات كل فرقة في هذا الملف
            const fileLevelStats = {};

            // قراءة العمود D (index 3) والعمود K (index 10)
            for (let i = 1; i < rows.length; i++) {
                if (!rows[i] || rows[i].length === 0) continue;

                const studentId = String(rows[i][3] || '').trim(); // العمود D
                const scoreStr = String(rows[i][10] || '').trim(); // العمود K

                // تحقق من أن رقم الطالب يبدأ بـ 22 أو 23 أو 24
                if (!studentId || studentId.length < 2) continue;

                const levelPrefix = studentId.substring(0, 2);
                if (!['22', '23', '24'].includes(levelPrefix)) continue;

                // تهيئة البيانات للفرقة إذا لم تكن موجودة
                if (!fileLevelStats[levelPrefix]) {
                    fileLevelStats[levelPrefix] = {
                        fileName: file.name,
                        courseName: courseName,
                        academicYear: academicYear,
                        level: levelPrefix,
                        totalStudents: 0,
                        attendingStudents: 0,
                        absentStudents: 0,
                        passedStudents: 0,
                        failedStudents: 0,
                        students: [] // قائمة الطلاب
                    };
                }

                const stats = fileLevelStats[levelPrefix];
                stats.totalStudents++;

                // قراءة اسم الطالب من العمود B (index 1)
                const studentName = String(rows[i][1] || '').trim();

                const studentData = {
                    seatNo: studentId,
                    name: studentName,
                    score: 0,
                    status: ''
                };

                // تحقق من أن الدرجة رقم صحيح
                const score = parseFloat(scoreStr);
                if (isNaN(score)) {
                    // غائب
                    stats.absentStudents++;
                    studentData.status = 'absent';
                    studentData.score = '-';
                } else {
                    // حاضر
                    stats.attendingStudents++;
                    studentData.score = score;

                    // حساب النجاح (50% من 100 = 50)
                    if (score >= 50) {
                        stats.passedStudents++;
                        studentData.status = 'passed';
                    } else {
                        stats.failedStudents++;
                        studentData.status = 'failed';
                    }
                }

                stats.students.push(studentData);
            }

            // إضافة نتائج كل فرقة في هذا الملف إلى المصفوفة النهائية
            Object.values(fileLevelStats).forEach(stats => {
                if (stats.totalStudents > 0) {
                    allResults.push(stats);
                }
            });
        }

        // حفظ البيانات في localStorage
        safeStorage.setItem('failureStatistics', JSON.stringify(allResults));

    } catch (error) {
        console.error('Error processing failure statistics:', error);
    }
}

function viewFailureStatistics() {
    // الانتقال لصفحة نسب نجاح التخلفات
    window.location.href = 'failure-statistics.html';
}

async function processAccountingFailureStatistics(files, selectedAcademicYear = '2025-2026') {
    try {
        // بادئات أرقام الجلوس الخاصة بالمحاسبة وإدارة الأعمال
        const validPrefixes = ['32', '33', '43', '44', '34'];

        const allAccountingResults = [];

        for (const file of files) {
            const data = await file.arrayBuffer();
            const workbook = XLSX.read(data, { type: 'array' });
            const firstSheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[firstSheetName];

            if (worksheet['!ref']) {
                const range = XLSX.utils.decode_range(worksheet['!ref']);
                range.s.c = 0;
                range.s.r = 0;
                worksheet['!ref'] = XLSX.utils.encode_range(range);
            }

            let rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: false });

            // قراءة اسم المادة من العمود F (index 5) في الصف الثاني
            let courseName = 'غير محدد';
            if (rows.length > 1 && rows[1] && rows[1][5]) {
                courseName = String(rows[1][5]).trim();
            }

            const academicYear = selectedAcademicYear;
            courseName = `تخلف - ${courseName} ${academicYear}`;

            // إحصائيات كل فرقة/شعبة في هذا الملف
            const fileLevelStats = {};

            // قراءة العمود D (index 3) والعمود K (index 10)
            for (let i = 1; i < rows.length; i++) {
                if (!rows[i] || rows[i].length === 0) continue;

                const studentId = String(rows[i][3] || '').trim(); // العمود D
                const scoreStr = String(rows[i][10] || '').trim(); // العمود K

                // تحقق من أن رقم الطالب له بادئة صالحة
                if (!studentId || studentId.length < 2) continue;

                const levelPrefix = studentId.substring(0, 2);
                if (!validPrefixes.includes(levelPrefix)) continue;

                // تهيئة البيانات للفرقة/الشعبة إذا لم تكن موجودة
                if (!fileLevelStats[levelPrefix]) {
                    fileLevelStats[levelPrefix] = {
                        fileName: file.name,
                        courseName: courseName,
                        academicYear: academicYear,
                        level: levelPrefix,
                        totalStudents: 0,
                        attendingStudents: 0,
                        absentStudents: 0,
                        passedStudents: 0,
                        failedStudents: 0,
                        students: []
                    };
                }

                const stats = fileLevelStats[levelPrefix];
                stats.totalStudents++;

                // قراءة اسم الطالب من العمود B (index 1)
                const studentName = String(rows[i][1] || '').trim();

                const studentData = {
                    seatNo: studentId,
                    name: studentName,
                    score: 0,
                    status: ''
                };

                // تحقق من أن الدرجة رقم صحيح
                const score = parseFloat(scoreStr);
                if (isNaN(score)) {
                    // غائب
                    stats.absentStudents++;
                    studentData.status = 'absent';
                    studentData.score = '-';
                } else {
                    // حاضر
                    stats.attendingStudents++;
                    studentData.score = score;

                    // حساب النجاح (50% من 100 = 50)
                    if (score >= 50) {
                        stats.passedStudents++;
                        studentData.status = 'passed';
                    } else {
                        stats.failedStudents++;
                        studentData.status = 'failed';
                    }
                }

                stats.students.push(studentData);
            }

            // إضافة نتائج كل فرقة/شعبة في هذا الملف إلى المصفوفة النهائية
            Object.values(fileLevelStats).forEach(stats => {
                if (stats.totalStudents > 0) {
                    allAccountingResults.push(stats);
                }
            });
        }

        // حفظ البيانات في safeStorage بمفتاح منفصل تماماً
        safeStorage.setItem('accountingFailureStatistics', JSON.stringify(allAccountingResults));

    } catch (error) {
        console.error('Error processing accounting failure statistics:', error);
    }
}

function viewAccountingFailureStatistics() {
    // الانتقال لصفحة نسب نجاح تخلفات المحاسبة وإدارة الأعمال
    window.location.href = 'accounting-failure-statistics.html';
}

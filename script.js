let allResults = [];
let isVerticalView = false;

// عند تحميل الصفحة، فحص إذا كان هناك نتائج محفوظة وجاء من صفحة أخرى
window.addEventListener('DOMContentLoaded', function () {
    const urlParams = new URLSearchParams(window.location.search);
    const returnFromPage = urlParams.get('return');

    if (returnFromPage) {
        const savedResults = localStorage.getItem('examStatistics');
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
            results.push(result);
        }



        allResults = results;
        // حفظ النتائج في localStorage
        localStorage.setItem('examStatistics', JSON.stringify(allResults));
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

                // قراءة درجة البونص من العمود J (index 9)، الصف الثاني (index 1)
                let bonusGrade = 0;
                if (rows[1] && rows[1][9] !== undefined) {
                    const bonusValue = String(rows[1][9]).trim();
                    if (bonusValue !== '' && !isNaN(parseFloat(bonusValue))) {
                        bonusGrade = parseFloat(bonusValue);
                        console.log('درجة البونص من الخلية J2:', bonusGrade);
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
                <h4 class="mb-0 course-title">${result.courseName}</h4>
                 <div class="no-print mt-2">
                    <button class="btn btn-sm btn-outline-secondary" onclick="toggleEdit(${index})">⚙️ تحديث الدرجات</button>
                    <button class="btn btn-sm btn-outline-danger me-1" onclick="removeSubject(${index})">🗑️ حذف</button>
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
                <h4 class="mb-0 course-title">${result.courseName}</h4>
                 <div class="no-print mt-2">
                    <button class="btn btn-sm btn-outline-secondary" onclick="toggleEdit(${index})">⚙️ تحديث الدرجات</button>
                    <button class="btn btn-sm btn-outline-danger me-1" onclick="removeSubject(${index})">🗑️ حذف</button>
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
    localStorage.setItem('examStatistics', JSON.stringify(allResults));
    // الانتقال لصفحة الإحصائيات
    window.location.href = 'statistics.html';
}

function viewStudentGrades() {
    // حفظ البيانات في localStorage
    localStorage.setItem('examStatistics', JSON.stringify(allResults));
    // الانتقال لصفحة درجات الطلاب
    window.location.href = 'students-grades.html';
}

function viewBonusAppliedStatistics() {
    // حفظ البيانات في localStorage
    localStorage.setItem('examStatistics', JSON.stringify(allResults));
    // الانتقال لصفحة إحصائيات البونص المطبق
    window.location.href = 'bonus-applied-statistics.html';
}

function resetAndAnalyzeNew() {
    // مسح البيانات المحفوظة
    localStorage.removeItem('examStatistics');
    allResults = [];

    // إعادة تحميل الصفحة بالكامل لضمان مسح كل شيء
    window.location.href = 'index.html';
}


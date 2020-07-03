const puppeteer = require("puppeteer");

var start = timeNow();
var navTime = 0;
var browser = null;
var mainWindow;
var traduction = {
	"No entregado": "No attempt",
	"Enviado para calificar": "Submitted for grading",
};

function timeNow() {
	return new Date().getTime() / 1000;
}

async function timeSpent(page) {
	await page.metrics().then((metrics) => {
		navTime += metrics.TaskDuration;
	});
}

async function setup(browserPath) {
	browser = await puppeteer
		.launch({
			executablePath: browserPath,
		})
		.catch((error) => {
			return null;
		});

	if (browser == null) return 1;
	page = await browser.newPage();
	await setupAbortion(page);
	return 0;
}

async function login(user, pass) {
	await page.goto("http://moodle22.newhorizons.edu.do/login/index.php");

	await page.type("#username", user);
	await page.type("#password", pass);
	await Promise.all([page.click("#loginbtn"), page.waitForNavigation()]);
}

async function getClassLinks() {
	var classes = await page.$$eval(".ml-1", (elements) => {
		var returnList = [];
		for (var i = 0; i < elements.length; i++) {
			returnList.push({
				name: elements[i].innerText,
				link: elements[i].parentElement.getAttribute("href"),
			});
		}
		return returnList;
	});
	return classes;
}

async function getClassAssignments(classData, newPage) {
	await newPage.goto(classData.link);
	const assignments = await newPage.$$eval(".instancename", (elements) => {
		var returnList = [];
		for (let i = 0; i < elements.length; i++) {
			const spanChild = elements[i].firstElementChild;
			const acceptedNames = ["Assignment", "Tarea"];
			if (!spanChild) continue;
			if (acceptedNames.indexOf(spanChild.innerText.trim()) == -1) {
				continue;
			}
			var assignmentName = elements[i].innerText.trim();
			assignmentName = assignmentName.split(" ");
			assignmentName = assignmentName.slice(0, assignmentName.length);
			assignmentName.pop();
			assignmentName = assignmentName.join(" ");

			const assignmentLink = elements[i].parentElement.getAttribute(
				"href"
			);
			returnList.push({
				name: assignmentName,
				link: assignmentLink,
			});
		}
		return returnList;
	});

	var dataPromises = [];
	for (let i = 0; i < assignments.length; i++) {
		assignments[i]["class"] = classData.name;
		var p = new Promise(async (resolve) => {
			var newPage = await browser.newPage();
			await setupAbortion(newPage);
			await getAssignmentData(assignments[i], newPage);
			await newPage.close();
			resolve("Success");
		});
		dataPromises.push(p);
	}
	await Promise.all(dataPromises);
	return assignments;
}

async function getAssignmentData(assignment, newPage) {
	await newPage.goto(assignment.link);

	const status = await newPage.$$eval("td", (elements) => {
		var returnObj = {};
		const acceptedData = [
			"Fecha de entrega",
			"Estado de la entrega",
			"Tiempo restante",
			"Submission status",
			"Due date",
			"Time remaining",
		];
		for (let i = 0; i < elements.length; i++) {
			const td = elements[i];
			console.log(td);
			if (acceptedData.indexOf(td.innerText.trim()) > -1) {
				const value = td.nextElementSibling.innerText.trim();
				returnObj[td.innerText.trim()] = value;
				i++;
			}
		}
		return returnObj;
	});
	assignment["status"] = status;
	var dataArray = [];
	dataArray.push(assignment.class, assignment.name);
	for (let k = 0; k < Object.values(assignment.status).length; k++) {
		const prop = Object.values(assignment.status)[k];
		if (traduction.hasOwnProperty(prop)) {
			dataArray.push(traduction[prop]);
		} else {
			dataArray.push(prop);
		}
	}
	for (let k = dataArray.length; k <= 5; k++) {
		dataArray.push("none");
	}
	dataArray.push(assignment.link);
	mainWindow.webContents.send("createTable", dataArray);
}

async function setupAbortion(page) {
	await Promise.all([
		page.setRequestInterception(true),
		page.setJavaScriptEnabled(false),
	]);

	page.on("request", (request) => {
		if (request.resourceType() != "document") {
			request.abort();
		} else request.continue();
	});

	page.once("load", async () => {
		await timeSpent(page);
	});
}

async function fullResponse(window) {
	mainWindow = window;
	navTime = 0;
	start = timeNow();
	const classes = await getClassLinks();
	var dataPromises = [];
	for (let i = 0; i < classes.length; i++) {
		var p = new Promise(async (resolve) => {
			var newPage = await browser.newPage();
			await setupAbortion(newPage);
			await getClassAssignments(classes[i], newPage);
			await newPage.close();
			resolve("Success");
		});
		dataPromises.push(p);
	}
	await Promise.all(dataPromises);
	console.log(`Total time spent: ${timeNow() - start}`);
	console.log(`Time spent on navigation: ${navTime}`);
}
//better scraping

module.exports = {
	setup: setup,
	login: login,
	getClassLinks: getClassLinks,
	getClassAssignments: getClassAssignments,
	getAssignmentData: getAssignmentData,
	fullResponse: fullResponse,
};

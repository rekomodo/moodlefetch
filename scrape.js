const puppeteer = require("puppeteer");

var start = timeNow();
var navTime = 0;
var browser = null;

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

async function getClassAssignments(classLink, newPage) {
	await newPage.goto(classLink);
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
			assignmentName = assignmentName
				.slice(0, assignmentName.length)
				.join(" ");
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
		var p = new Promise(async (resolve) => {
			var newPage = await browser.newPage();
			await setupAbortion(newPage);
			const status = await getAssignmentData(
				assignments[i].link,
				newPage
			);
			assignments[i].status = status;
			await newPage.close();
			resolve("Success");
		});
		dataPromises.push(p);
	}
	await Promise.all(dataPromises);
	return assignments;
}

async function getAssignmentData(assignmentLink, newPage) {
	await newPage.goto(assignmentLink);

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
	return status;
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

function allClassDataToArray(data) {
	var traduction = {
		"No entregado": "No attempt",
		"Enviado para calificar": "Submitted for grading",
	};
	returnArray = [];
	links = {};
	for (let i = 0; i < data.length; i++) {
		const className = data[i].name;
		for (let j = 0; j < data[i].assignments.length; j++) {
			newArray = [];
			const assignment = data[i].assignments[j];
			assignment.name = assignment.name.split(" ");
			assignment.name.pop();
			assignment.name = assignment.name.join(" ");

			newArray.push(className, assignment.name);
			links[assignment.name] = assignment.link;
			for (let k = 0; k < Object.values(assignment.status).length; k++) {
				const prop = Object.values(assignment.status)[k];
				if (traduction.hasOwnProperty(prop)) {
					newArray.push(traduction[prop]);
				} else {
					newArray.push(prop);
				}
			}
			for (let k = newArray.length; k <= 5; k++) {
				newArray.push("none");
			}
			returnArray.push(newArray);
		}
	}
	returnArray.push(links);
	return returnArray;
}

async function fullResponse() {
	navTime = 0;
	start = timeNow();
	const classes = await getClassLinks();
	var allClassData = [];
	var dataPromises = [];
	for (let i = 0; i < classes.length; i++) {
		const classLink = classes[i].link;
		allClassData.push({ name: classes[i].name });
		var p = new Promise(async (resolve) => {
			var newPage = await browser.newPage();
			await setupAbortion(newPage);
			const assignments = await getClassAssignments(classLink, newPage);
			allClassData[i].assignments = assignments;
			await newPage.close();
			resolve("Success");
		});
		dataPromises.push(p);
	}
	await Promise.all(dataPromises);
	console.log(`Total time spent: ${timeNow() - start}`);
	console.log(`Time spent on navigation: ${navTime}`);
	return allClassDataToArray(allClassData);
}
//better scraping
//make login request and separate getting classes and assignments
//look for the class teacher

module.exports = {
	setup: setup,
	login: login,
	getClassLinks: getClassLinks,
	getClassAssignments: getClassAssignments,
	getAssignmentData: getAssignmentData,
	fullResponse: fullResponse,
};

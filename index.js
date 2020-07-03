const fs = require("fs");
const url = require("url");
const path = require("path");
const scrape = require("./scrape.js");
const electron = require("electron");
const { app, BrowserWindow, Menu, ipcMain, dialog } = electron;

//change default browser path depending on platform
var defaultBrowserPath =
	"C:/Program Files (x86)/Google/Chrome/Application/chrome.exe";
const defaultConfigJson = `
{
	"browserPath": "${defaultBrowserPath}",
	"blacklist": []
}
`;
const pathToConfig = "./config.json";
if (!fs.existsSync(pathToConfig)) {
	fs.writeFileSync("./config.json", defaultConfigJson);
}
const browserPath = JSON.parse(fs.readFileSync("./config.json")).browserPath;
//uncomment to disable devtools
//process.env.NODE_ENV = "production";

var mainWindow, loginWindow;

app.on("window-all-closed", () => {
	app.quit();
});

app.on("ready", async () => {
	loginWindow = new BrowserWindow({
		webPreferences: {
			nodeIntegration: true,
		},
	});

	loginWindow.loadURL(
		url.format({
			pathname: path.join(__dirname, "index.html"),
			protocol: "file:",
			slashes: true,
		})
	);

	await trySetup(browserPath);

	const mainMenu = Menu.buildFromTemplate(mainMenuTemplate);
	Menu.setApplicationMenu(mainMenu);
});

async function trySetup(browserPath) {
	const status = await scrape.setup(browserPath);
	if (status == 1) {
		const browserFile = await dialog.showOpenDialog({
			title:
				"Browser not found, search for browser.exe (firefox, safari, msedge, chrome)",
			properties: ["openFile"],
			filters: [{ name: ".exe", extensions: ["exe"] }],
		});
		if (browserFile.canceled) {
			trySetup(browserPath);
		} else {
			var newPath = browserFile.filePaths[0];
			const configJSON = JSON.parse(fs.readFileSync("./config.json"));
			configJSON.browserPath = newPath;
			fs.writeFileSync("./config.json", JSON.stringify(configJSON));
			trySetup(newPath);
		}
	} else {
		console.log("Browser init succesful");
	}
}

//catch login
ipcMain.on("login", async (e, { user, pass }) => {
	await scrape.login(user, pass);
	createMainWindow();
	loginWindow.close();
	await scrape.fullResponse(mainWindow);
});

function createMainWindow(tableData) {
	mainWindow = new BrowserWindow({
		webPreferences: {
			nodeIntegration: true,
		},
	});
	mainWindow.loadURL(
		url.format({
			pathname: path.join(__dirname, "main.html"),
			protocol: "file:",
			slashes: true,
		})
	);

	//quit app when window is closed
	mainWindow.on("closed", () => {
		app.quit();
	});

	const mainMenu = Menu.buildFromTemplate(mainMenuTemplate);
	Menu.setApplicationMenu(mainMenu);
}

const mainMenuTemplate = [
	{
		label: "File",
		submenu: [
			{
				label: "Quit",
				accelerator:
					process.platform == "darwin" ? "Command+Q" : "Ctrl+Q",
				click() {
					app.quit();
				},
			},
		],
	},
];

//if mac, add empty object to menu so it displays file instead of Electron
if (process.platform == "darwin") {
	mainMenuTemplate.unshift({}); //unshift adds an element to the beggining of the array
}

//Add dev tools item if not in prod
if (process.env.NODE_ENV !== "production") {
	mainMenuTemplate.push({
		label: "Dev Tools",
		submenu: [
			{
				label: "Toggle dev tools",
				accelerator:
					process.platform == "darwin" ? "Command+I" : "Ctrl+I",
				click(item, focusedWindow) {
					focusedWindow.toggleDevTools();
				},
			},
			{
				role: "reload",
			},
		],
	});
}

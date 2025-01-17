import { dom } from "@fortawesome/fontawesome-svg-core";
import Point from "./classes/Point";
import ReadOnlyService from "./services/ReadOnlyService";
import InfoService from "./services/InfoService";
import ThrottlingService from "./services/ThrottlingService";
import ConfigService from "./services/ConfigService";
import html2canvas from "html2canvas";
import DOMPurify from "dompurify";

const RAD_TO_DEG = 180.0 / Math.PI;
const DEG_TO_RAD = Math.PI / 180.0;
const _45_DEG_IN_RAD = 45 * DEG_TO_RAD;

const whiteboard = {
    canvas: null,
    ctx: null,
    drawcolor: "black",
    previousToolHtmlElem: null, // useful for handling read-only mode
    tool: "mouse",
    thickness: 4,
    /**
     * @type Point
     */
    prevPos: new Point(0, 0),
    /**
     * @type Point
     */
    startCoords: new Point(0, 0),
    drawFlag: false,
    oldGCO: null,
    mouseover: false,
    lineCap: "round", //butt, square
    backgroundGrid: null,
    canvasElement: null,
    cursorContainer: null,
    imgContainer: null,
    svgContainer: null, //For draw prev
    mouseOverlay: null,
    ownCursor: null,
    penSmoothLastCoords: [],
    penSmoothLastCoordsArrow: [],
    penSmoothLastCoordsTab: [],
    penSmoothLastCoordsDotted: [],
    penSmoothLastCoordsDottedArrow: [],
    penSmoothLastCoordsDottedCircle: [],
    penSmoothLastCoordsCircle: [],
    svgLine: null,
    firstX: 0,
    firstY: 0,
    DottedfirstX: 0,
    DottedfirstY: 0,

    svgArrow: null,
    svgArrowTab: null,
    svgArrowDootedTab: null,
    svgDottedLine: null,
    svgDottedLineArrow: null,
    svgRect: null,
    svgCirle: null,
    svgCirleFixed: null,
    drawBuffer: [],
    undoBuffer: [],
    drawId: 0, //Used for undo/redo functions
    imgDragActive: false,
    latestActiveTextBoxId: false, //The id of the latest clicked Textbox (for font and color change)
    pressedKeys: {},
    settings: {
        whiteboardId: "0",
        username: "unknown",
        sendFunction: null,
        backgroundGridUrl: "./images/gb_grid.png",
    },
    lastPointerSentTime: 0,
    /**
     * @type Point
     */
    lastPointerPosition: new Point(0, 0),
    loadWhiteboard: function (whiteboardContainer, newSettings) {
        const svgns = "http://www.w3.org/2000/svg";
        const _this = this;
        for (const i in newSettings) {
            this.settings[i] = newSettings[i];
        }
        this.settings["username"] = this.settings["username"].replace(/[^0-9a-z]/gi, "");

        //background grid (repeating image) and smallest screen indication
        _this.backgroundGrid = $(
            `<div style="position: absolute; left:0px; top:0; opacity: 0.2; height: 100%; width: 100%;"></div>`
        );
        // container for background images
        _this.imgContainer = $(
            '<div style="position: absolute; left:0px; top:0; height: 100%; width: 100%;"></div>'
        );
        // whiteboard canvas
        _this.canvasElement = $(
            '<canvas id="whiteboardCanvas" style="position: absolute; left:0px; top:0; cursor:crosshair;" width="100%" height="100%"></canvas>'
        );
        // SVG container holding drawing or moving previews
        _this.svgContainer = $('<svg style="position: absolute; top:0px; left:0px;" ></svg>');
        // drag and drop indicator, hidden by default
        _this.dropIndicator = $(
            '<div style="position:absolute; height: 100%; width: 100%; border: 7px dashed gray; text-align: center; top: 0px; left: 0px; color: gray; font-size: 23em; display: none;"><i class="far fa-plus-square" aria-hidden="true"></i></div>'
        );
        // container for other users cursors
        _this.cursorContainer = $(
            '<div style="position: absolute; left:0px; top:0; height: 100%; width: 100%;"></div>'
        );
        // container for texts by users
        _this.textContainer = $(
            '<div class="textcontainer" style="position: absolute; left:0px; top:0; height: 100%; width: 100%; cursor:text;"></div>'
        );
        // mouse overlay for draw callbacks
        _this.mouseOverlay = $(
            '<div id="mouseOverlay" style="cursor:none; position: absolute; left:0px; top:0; height: 100%; width: 100%;"></div>'
        );

        $(whiteboardContainer)
            .append(_this.backgroundGrid)
            .append(_this.imgContainer)
            .append(_this.canvasElement)
            .append(_this.svgContainer)
            .append(_this.dropIndicator)
            .append(_this.cursorContainer)
            .append(_this.textContainer)
            .append(_this.mouseOverlay);

        // render newly added icons
        dom.i2svg();

        this.canvas = $("#whiteboardCanvas")[0];

        /*this.canvas.height = innerHeight;
        this.canvas.width = innerWidth;*/

        this.ctx = this.canvas.getContext("2d");

        this.ctx.canvas.width = window.innerWidth;
        this.ctx.canvas.height = window.innerHeight;

        this.oldGCO = this.ctx.globalCompositeOperation;

        window.addEventListener("resize", function () {
            // Handle resize
            const dbCp = JSON.parse(JSON.stringify(_this.drawBuffer)); // Copy the buffer
            /* _this.canvas.width = $(window).width();
            _this.canvas.height = $(window).height(); // Set new canvas height
            _this.drawBuffer = [];
            _this.textContainer.empty();
            _this.loadData(dbCp); // draw old content in*/

            $("#whiteboardCanvas").outerHeight(
                $(window).height() -
                    $("#whiteboardCanvas").offset().top -
                    Math.abs(
                        $("#whiteboardCanvas").outerHeight(true) -
                            $("#whiteboardCanvas").outerHeight()
                    )
            );
            $(window).on("resize", function () {
                $("#whiteboardCanvas").outerHeight(
                    $(window).height() -
                        $("#whiteboardCanvas").offset().top -
                        Math.abs(
                            $("#whiteboardCanvas").outerHeight(true) -
                                $("#whiteboardCanvas").outerHeight()
                        )
                );
            });
        });

        $(_this.mouseOverlay).on("mousedown touchstart", function (e) {
            _this.mousedown(e);
        });

        _this.mousedown = function (e) {
            if (_this.imgDragActive || _this.drawFlag) {
                return;
            }
            if (ReadOnlyService.readOnlyActive) return;

            _this.drawFlag = true;

            const currentPos = Point.fromEvent(e);

            if (_this.tool === "pen") {
                _this.penSmoothLastCoords = [
                    currentPos.x,
                    currentPos.y,
                    currentPos.x,
                    currentPos.y,
                    currentPos.x,
                    currentPos.y,
                ];
            } else if (_this.tool === "penArrow") {
                _this.penSmoothLastCoordsArrow = [
                    currentPos.x,
                    currentPos.y,
                    currentPos.x,
                    currentPos.y,
                    currentPos.x,
                    currentPos.y,
                ];
            } else if (_this.tool === "penTab") {
                _this.penSmoothLastCoordsTab = [
                    currentPos.x,
                    currentPos.y,
                    currentPos.x,
                    currentPos.y,
                    currentPos.x,
                    currentPos.y,
                ];
            } else if (_this.tool === "penDotted") {
                _this.penSmoothLastCoordsDotted = [
                    currentPos.x,
                    currentPos.y,
                    currentPos.x,
                    currentPos.y,
                    currentPos.x,
                    currentPos.y,
                ];
            } else if (_this.tool === "penDottedArrow") {
                _this.penSmoothLastCoordsDottedArrow = [
                    currentPos.x,
                    currentPos.y,
                    currentPos.x,
                    currentPos.y,
                    currentPos.x,
                    currentPos.y,
                ];
            } else if (_this.tool === "penDottedCircle") {
                _this.penSmoothLastCoordsDottedCircle = [
                    currentPos.x,
                    currentPos.y,
                    currentPos.x,
                    currentPos.y,
                    currentPos.x,
                    currentPos.y,
                ];
            } else if (_this.tool === "penCircle") {
                _this.penSmoothLastCoordsCircle = [
                    currentPos.x,
                    currentPos.y,
                    currentPos.x,
                    currentPos.y,
                    currentPos.x,
                    currentPos.y,
                ];
            } else if (_this.tool === "eraser") {
                _this.drawEraserLine(
                    currentPos.x,
                    currentPos.y,
                    currentPos.x,
                    currentPos.y,
                    _this.thickness
                );
                _this.sendFunction({
                    t: _this.tool,
                    d: [currentPos.x, currentPos.y, currentPos.x, currentPos.y],
                    th: _this.thickness,
                });
            } else if (_this.tool === "line") {
                _this.startCoords = currentPos;
                _this.svgLine = document.createElementNS(svgns, "line");
                _this.svgLine.setAttribute("stroke", "gray");
                _this.svgLine.setAttribute("stroke-dasharray", "5, 5");
                _this.svgLine.setAttribute("x1", currentPos.x);
                _this.svgLine.setAttribute("y1", currentPos.y);
                _this.svgLine.setAttribute("x2", currentPos.x);
                _this.svgLine.setAttribute("y2", currentPos.y);
                _this.svgContainer.append(_this.svgLine);
            } else if (_this.tool === "dotted") {
                _this.startCoords = currentPos;
                _this.svgDottedLine = document.createElementNS(svgns, "dotted");
                _this.svgDottedLine.setAttribute("stroke", "gray");
                _this.svgDottedLine.setAttribute("stroke-dasharray", "5, 5");
                _this.svgDottedLine.setAttribute("x1", currentPos.x);
                _this.svgDottedLine.setAttribute("y1", currentPos.y);
                _this.svgDottedLine.setAttribute("x2", currentPos.x);
                _this.svgDottedLine.setAttribute("y2", currentPos.y);
                _this.svgContainer.append(_this.svgDottedLine);
            } else if (_this.tool === "dottedArrow") {
                _this.startCoords = currentPos;
                _this.svgDottedLineArrow = document.createElementNS(svgns, "dottedArrow");
                _this.svgDottedLineArrow.setAttribute("stroke", "gray");
                _this.svgDottedLineArrow.setAttribute("stroke-dasharray", "5, 5");
                _this.svgDottedLineArrow.setAttribute("x1", currentPos.x);
                _this.svgDottedLineArrow.setAttribute("y1", currentPos.y);
                _this.svgDottedLineArrow.setAttribute("x2", currentPos.x);
                _this.svgDottedLineArrow.setAttribute("y2", currentPos.y);
                _this.svgContainer.append(_this.svgDottedLineArrow);
            } else if (_this.tool === "arrow") {
                _this.startCoords = currentPos;
                _this.svgArrow = document.createElementNS(svgns, "arrow");
                _this.svgArrow.setAttribute("stroke", "gray");
                _this.svgArrow.setAttribute("stroke-dasharray", "5, 5");
                _this.svgArrow.setAttribute("x1", currentPos.x);
                _this.svgArrow.setAttribute("y1", currentPos.y);
                _this.svgArrow.setAttribute("x2", currentPos.x);
                _this.svgArrow.setAttribute("y2", currentPos.y);
                _this.svgContainer.append(_this.svgArrow);
            } else if (_this.tool === "arrowTab") {
                _this.startCoords = currentPos;
                _this.svgArrowTab = document.createElementNS(svgns, "arrowTab");
                _this.svgArrowTab.setAttribute("stroke", "gray");
                _this.svgArrowTab.setAttribute("stroke-dasharray", "5, 5");
                _this.svgArrowTab.setAttribute("x1", currentPos.x);
                _this.svgArrowTab.setAttribute("y1", currentPos.y);
                _this.svgArrowTab.setAttribute("x2", currentPos.x);
                _this.svgArrowTab.setAttribute("y2", currentPos.y);
                _this.svgContainer.append(_this.svgArrowTab);
            } else if (_this.tool === "arrowDootedTab") {
                _this.startCoords = currentPos;
                _this.svgArrowDootedTab = document.createElementNS(svgns, "arrowDootedTab");
                _this.svgArrowDootedTab.setAttribute("stroke", "gray");
                _this.svgArrowDootedTab.setAttribute("stroke-dasharray", "5, 5");
                _this.svgArrowDootedTab.setAttribute("x1", currentPos.x);
                _this.svgArrowDootedTab.setAttribute("y1", currentPos.y);
                _this.svgArrowDootedTab.setAttribute("x2", currentPos.x);
                _this.svgArrowDootedTab.setAttribute("y2", currentPos.y);
                _this.svgContainer.append(_this.svgArrowDootedTab);
            } else if (_this.tool === "rect" || _this.tool === "recSelect") {
                _this.svgContainer.find("rect").remove();
                _this.svgRect = document.createElementNS(svgns, "rect");
                _this.svgRect.setAttribute("stroke", "gray");
                _this.svgRect.setAttribute("stroke-dasharray", "5, 5");
                _this.svgRect.setAttribute("style", "fill-opacity:0.0;");
                _this.svgRect.setAttribute("x", currentPos.x);
                _this.svgRect.setAttribute("y", currentPos.y);
                _this.svgRect.setAttribute("width", 0);
                _this.svgRect.setAttribute("height", 0);
                _this.svgContainer.append(_this.svgRect);
                _this.startCoords = currentPos;
            } else if (_this.tool === "circle") {
                _this.svgCirle = document.createElementNS(svgns, "circle");
                _this.svgCirle.setAttribute("stroke", "gray");
                _this.svgCirle.setAttribute("stroke-dasharray", "5, 5");
                _this.svgCirle.setAttribute("style", "fill-opacity:0.0;");
                _this.svgCirle.setAttribute("cx", currentPos.x);
                _this.svgCirle.setAttribute("cy", currentPos.y);
                _this.svgCirle.setAttribute("r", 0);
                _this.svgContainer.append(_this.svgCirle);
                _this.startCoords = currentPos;
            } else if (_this.tool === "circleFilled") {
                _this.svgCirle = document.createElementNS(svgns, "circleFilled");
                _this.svgCirle.setAttribute("stroke", "gray");
                _this.svgCirle.setAttribute("stroke-dasharray", "5, 5");
                _this.svgCirle.setAttribute("style", "fill-opacity:0.0;");
                _this.svgCirle.setAttribute("cx", currentPos.x);
                _this.svgCirle.setAttribute("cy", currentPos.y);
                _this.svgCirle.setAttribute("r", 0);
                _this.svgContainer.append(_this.svgCirle);
                _this.startCoords = currentPos;
            } else if (_this.tool === "circleFixed") {
                _this.svgCirleFixed = document.createElementNS(svgns, "circleFixed");
                _this.svgCirleFixed.setAttribute("stroke", "gray");
                _this.svgCirleFixed.setAttribute("stroke-dasharray", "5, 5");
                _this.svgCirleFixed.setAttribute("style", "fill-opacity:0.0;");
                _this.svgCirleFixed.setAttribute("cx", currentPos.x);
                _this.svgCirleFixed.setAttribute("cy", currentPos.y);
                _this.svgCirleFixed.setAttribute("r", 0);
                _this.svgContainer.append(_this.svgCirleFixed);
                _this.startCoords = currentPos;
            }

            _this.prevPos = currentPos;
        };

        _this.textContainer.on("mousemove touchmove", function (e) {
            e.preventDefault();

            if (_this.imgDragActive || !$(e.target).hasClass("textcontainer")) {
                return;
            }
            if (ReadOnlyService.readOnlyActive) return;

            const currentPos = Point.fromEvent(e);

            ThrottlingService.throttle(currentPos, () => {
                _this.lastPointerPosition = currentPos;
                _this.sendFunction({
                    t: "cursor",
                    event: "move",
                    d: [currentPos.x, currentPos.y],
                    username: _this.settings.username,
                });
            });
        });

        _this.mouseOverlay.on("mousemove touchmove", function (e) {
            e.preventDefault();
            if (ReadOnlyService.readOnlyActive) return;
            _this.triggerMouseMove(e);
        });

        _this.mouseOverlay.on("mouseup touchend touchcancel", function (e) {
            _this.mouseup(e);
        });

        _this.mouseup = function (e) {
            if (_this.imgDragActive) {
                return;
            }
            if (ReadOnlyService.readOnlyActive) return;
            _this.drawFlag = false;
            _this.drawId++;
            _this.ctx.globalCompositeOperation = _this.oldGCO;

            let currentPos = Point.fromEvent(e);

            if (currentPos.isZeroZero) {
                _this.sendFunction({
                    t: "cursor",
                    event: "out",
                    username: _this.settings.username,
                });
            }

            if (_this.tool === "line") {
                if (_this.pressedKeys.shift) {
                    currentPos = _this.getRoundedAngles(currentPos);
                }
                _this.drawPenLine(
                    currentPos.x,
                    currentPos.y,
                    _this.startCoords.x,
                    _this.startCoords.y,
                    _this.drawcolor,
                    _this.thickness
                );
                _this.sendFunction({
                    t: _this.tool,
                    d: [currentPos.x, currentPos.y, _this.startCoords.x, _this.startCoords.y],
                    c: _this.drawcolor,
                    th: _this.thickness,
                });
                _this.svgContainer.find("line").remove();
            }

            if (_this.tool === "lineDotted") {
                if (_this.pressedKeys.shift) {
                    currentPos = _this.getRoundedAngles(currentPos);
                }
                _this.drawPenLineDotted(
                    currentPos.x,
                    currentPos.y,
                    _this.startCoords.x,
                    _this.startCoords.y,
                    _this.drawcolor,
                    _this.thickness
                );
                _this.sendFunction({
                    t: _this.tool,
                    d: [currentPos.x, currentPos.y, _this.startCoords.x, _this.startCoords.y],
                    c: _this.drawcolor,
                    th: _this.thickness,
                });
                _this.svgContainer.find("lineDotted").remove();
            } else if (_this.tool === "dotted") {
                /*        (fromX, fromY, toX, toY, color, thickness, aWidth, aLength, arrowStart, arrowEnd)*/
                if (_this.pressedKeys.shift) {
                    currentPos = _this.getRoundedAngles(currentPos);
                }
                _this.drawDotted(
                    currentPos.x,
                    currentPos.y,
                    _this.startCoords.x,
                    _this.startCoords.y,
                    _this.drawcolor,
                    _this.thickness,
                    _this.thickness * 2,
                    _this.thickness * 2
                );

                _this.sendFunction({
                    t: _this.tool,
                    d: [currentPos.x, currentPos.y, _this.startCoords.x, _this.startCoords.y],
                    c: _this.drawcolor,
                    th: _this.thickness,
                    //aWidth: _this.aWidth,
                    //aLength: _this.aLength,
                    //arrowStart: _this.arrowStart,
                    //arrowEnd: _this.arrowEnd,
                });

                _this.svgContainer.find("dotted").remove();
            } else if (_this.tool === "dottedArrow") {
                /*        (fromX, fromY, toX, toY, color, thickness, aWidth, aLength, arrowStart, arrowEnd)*/
                if (_this.pressedKeys.shift) {
                    currentPos = _this.getRoundedAngles(currentPos);
                }
                _this.drawDottedArrow(
                    currentPos.x,
                    currentPos.y,
                    _this.startCoords.x,
                    _this.startCoords.y,
                    _this.drawcolor,
                    _this.thickness,
                    _this.thickness * 2,
                    _this.thickness * 2,
                    5,
                    5,
                    true,
                    false
                );
                _this.sendFunction({
                    t: _this.tool,
                    d: [currentPos.x, currentPos.y, _this.startCoords.x, _this.startCoords.y],
                    c: _this.drawcolor,
                    th: _this.thickness,
                    //aWidth: _this.aWidth,
                    //aLength: _this.aLength,
                    //arrowStart: _this.arrowStart,
                    //arrowEnd: _this.arrowEnd,
                });
                _this.svgContainer.find("dottedArrow").remove();
            } else if (_this.tool === "arrow") {
                /*        (fromX, fromY, toX, toY, color, thickness, aWidth, aLength, arrowStart, arrowEnd)*/
                if (_this.pressedKeys.shift) {
                    currentPos = _this.getRoundedAngles(currentPos);
                }
                _this.drawArrow(
                    currentPos.x,
                    currentPos.y,
                    _this.startCoords.x,
                    _this.startCoords.y,
                    _this.drawcolor,
                    _this.thickness,
                    5,
                    5,
                    true,
                    false
                );

                _this.sendFunction({
                    t: _this.tool,
                    d: [currentPos.x, currentPos.y, _this.startCoords.x, _this.startCoords.y],
                    c: _this.drawcolor,
                    th: _this.thickness,
                    //aWidth: _this.aWidth,
                    //aLength: _this.aLength,
                    //arrowStart: _this.arrowStart,
                    //arrowEnd: _this.arrowEnd,
                });

                _this.svgContainer.find("arrow").remove();
            } else if (_this.tool === "penArrow") {
                /*        (fromX, fromY, toX, toY, color, thickness, aWidth, aLength, arrowStart, arrowEnd)*/
                if (_this.pressedKeys.shift) {
                    currentPos = _this.getRoundedAngles(currentPos);
                }
                _this.drawArrow(
                    currentPos.x,
                    currentPos.y,
                    this.firstX,
                    this.firstY,
                    _this.drawcolor,
                    _this.thickness,
                    5,
                    5,
                    true,
                    false
                );

                _this.sendFunction({
                    t: _this.tool,
                    d: [currentPos.x, currentPos.y, currentPos.x, currentPos.y],
                    c: _this.drawcolor,
                    th: _this.thickness,
                    //aWidth: _this.aWidth,
                    //aLength: _this.aLength,
                    //arrowStart: _this.arrowStart,
                    //arrowEnd: _this.arrowEnd,
                });

                _this.svgContainer.find("penArrow").remove();
            } else if (_this.tool === "penTab") {
                /*        (fromX, fromY, toX, toY, color, thickness, aWidth, aLength, arrowStart, arrowEnd)*/
                if (_this.pressedKeys.shift) {
                    currentPos = _this.getRoundedAngles(currentPos);
                }
                _this.drawTab(
                    currentPos.x,
                    currentPos.y,
                    this.firstX,
                    this.firstY,
                    _this.drawcolor,
                    _this.thickness,
                    5,
                    5,
                    true,
                    false
                );

                _this.sendFunction({
                    t: _this.tool,
                    d: [currentPos.x, currentPos.y, currentPos.x, currentPos.y],
                    c: _this.drawcolor,
                    th: _this.thickness,
                    //aWidth: _this.aWidth,
                    //aLength: _this.aLength,
                    //arrowStart: _this.arrowStart,
                    //arrowEnd: _this.arrowEnd,
                });

                _this.svgContainer.find("penTab").remove();
            } else if (_this.tool === "penDottedArrow") {
                /*        (fromX, fromY, toX, toY, color, thickness, aWidth, aLength, arrowStart, arrowEnd)*/
                if (_this.pressedKeys.shift) {
                    currentPos = _this.getRoundedAngles(currentPos);
                }
                _this.drawArrow(
                    currentPos.x,
                    currentPos.y,
                    this.DottedfirstX,
                    this.DottedfirstY,
                    _this.drawcolor,
                    _this.thickness,
                    5,
                    5,
                    true,
                    false
                );

                _this.sendFunction({
                    t: _this.tool,
                    d: [currentPos.x, currentPos.y, currentPos.x, currentPos.y],
                    c: _this.drawcolor,
                    th: _this.thickness,
                    //aWidth: _this.aWidth,
                    //aLength: _this.aLength,
                    //arrowStart: _this.arrowStart,
                    //arrowEnd: _this.arrowEnd,
                });

                _this.svgContainer.find("penDottedArrow").remove();
            } else if (_this.tool === "penDottedCircle") {
                const r = 1;
                if (_this.thickness < 0) {
                    r = 10;
                }
                _this.drawCircleFixedFilled(
                    this.DottedfirstX,
                    this.DottedfirstY,
                    r,
                    _this.drawcolor,
                    _this.thickness
                );
                _this.sendFunction({
                    t: _this.tool,
                    d: [this.DottedfirstX, this.DottedfirstY, r],
                    c: _this.drawcolor,
                    th: _this.thickness,
                });

                _this.svgContainer.find("penDottedCircle").remove();
            } else if (_this.tool === "penCircle") {
                const r = 1;
                if (_this.thickness < 0) {
                    r = 10;
                }
                _this.drawCircleFixedFilled(
                    this.DottedfirstX,
                    this.DottedfirstY,
                    r,
                    _this.drawcolor,
                    _this.thickness
                );
                _this.sendFunction({
                    t: _this.tool,
                    d: [this.DottedfirstX, this.DottedfirstY, r],
                    c: _this.drawcolor,
                    th: _this.thickness,
                });

                _this.svgContainer.find("penCircle").remove();
            } else if (_this.tool === "arrowTab") {
                /*        (fromX, fromY, toX, toY, color, thickness, aWidth, aLength, arrowStart, arrowEnd)*/
                if (_this.pressedKeys.shift) {
                    currentPos = _this.getRoundedAngles(currentPos);
                }
                _this.drawArrowTab(
                    currentPos.x,
                    currentPos.y,
                    _this.startCoords.x,
                    _this.startCoords.y,
                    _this.drawcolor,
                    _this.thickness,
                    5,
                    5,
                    true,
                    false
                );

                _this.sendFunction({
                    t: _this.tool,
                    d: [currentPos.x, currentPos.y, _this.startCoords.x, _this.startCoords.y],
                    c: _this.drawcolor,
                    th: _this.thickness,
                    //aWidth: _this.aWidth,
                    //aLength: _this.aLength,
                    //arrowStart: _this.arrowStart,
                    //arrowEnd: _this.arrowEnd,
                });

                _this.svgContainer.find("arrowTab").remove();
            } else if (_this.tool === "arrowDootedTab") {
                /*        (fromX, fromY, toX, toY, color, thickness, aWidth, aLength, arrowStart, arrowEnd)*/
                if (_this.pressedKeys.shift) {
                    currentPos = _this.getRoundedAngles(currentPos);
                }
                _this.drawArrowDootedTab(
                    currentPos.x,
                    currentPos.y,
                    _this.startCoords.x,
                    _this.startCoords.y,
                    _this.drawcolor,
                    _this.thickness,
                    5,
                    5,
                    true,
                    false
                );

                _this.sendFunction({
                    t: _this.tool,
                    d: [currentPos.x, currentPos.y, _this.startCoords.x, _this.startCoords.y],
                    c: _this.drawcolor,
                    th: _this.thickness,
                    //aWidth: _this.aWidth,
                    //aLength: _this.aLength,
                    //arrowStart: _this.arrowStart,
                    //arrowEnd: _this.arrowEnd,
                });

                _this.svgContainer.find("arrowDootedTab").remove();
            } else if (_this.tool === "pen") {
                _this.drawId--;
                _this.pushPointSmoothPen(currentPos.x, currentPos.y);
                _this.drawId++;
            } else if (_this.tool === "penArrow") {
                _this.drawId--;
                _this.pushPointSmoothPenArrow(currentPos.x, currentPos.y);
                _this.drawId++;
            } else if (_this.tool === "penTab") {
                _this.drawId--;
                _this.pushPointSmoothPenTab(currentPos.x, currentPos.y);
                _this.drawId++;
            } else if (_this.tool === "penDotted") {
                _this.drawId--;
                _this.pushPointSmoothPenDotted(currentPos.x, currentPos.y);
                _this.drawId++;
            } else if (_this.tool === "penDottedArrow") {
                _this.drawId--;
                _this.pushPointSmoothPenDottedArrowArrow(currentPos.x, currentPos.y);
                _this.drawId++;
            } else if (_this.tool === "penDottedCircle") {
                _this.drawId--;
                _this.pushPointSmoothPenDottedCircle(currentPos.x, currentPos.y);
                _this.drawId++;
            } else if (_this.tool === "penCircle") {
                _this.drawId--;
                _this.pushPointSmoothPenCircle(currentPos.x, currentPos.y);
                _this.drawId++;
            } else if (_this.tool === "rect") {
                if (_this.pressedKeys.shift) {
                    if (
                        (currentPos.x - _this.startCoords.x) *
                            (currentPos.y - _this.startCoords.y) >
                        0
                    ) {
                        currentPos = new Point(
                            currentPos.x,
                            _this.startCoords.y + (currentPos.x - _this.startCoords.x)
                        );
                    } else {
                        currentPos = new Point(
                            currentPos.x,
                            _this.startCoords.y - (currentPos.x - _this.startCoords.x)
                        );
                    }
                }
                _this.drawRec(
                    _this.startCoords.x,
                    _this.startCoords.y,
                    currentPos.x,
                    currentPos.y,
                    _this.drawcolor,
                    _this.thickness
                );
                _this.sendFunction({
                    t: _this.tool,
                    d: [_this.startCoords.x, _this.startCoords.y, currentPos.x, currentPos.y],
                    c: _this.drawcolor,
                    th: _this.thickness,
                });
                _this.svgContainer.find("rect").remove();
            } else if (_this.tool === "circle") {
                const r = currentPos.distTo(_this.startCoords);
                _this.drawCircle(
                    _this.startCoords.x,
                    _this.startCoords.y,
                    r,
                    _this.drawcolor,
                    _this.thickness
                );
                _this.sendFunction({
                    t: _this.tool,
                    d: [_this.startCoords.x, _this.startCoords.y, r],
                    c: _this.drawcolor,
                    th: _this.thickness,
                });
                _this.svgContainer.find("circle").remove();
            } else if (_this.tool === "circleFilled") {
                const r = currentPos.distTo(_this.startCoords);
                _this.drawCircleFilled(
                    _this.startCoords.x,
                    _this.startCoords.y,
                    r,
                    _this.drawcolor,
                    _this.thickness
                );
                _this.sendFunction({
                    t: _this.tool,
                    d: [_this.startCoords.x, _this.startCoords.y, r],
                    c: _this.drawcolor,
                    th: _this.thickness,
                });
                _this.svgContainer.find("circleFilled").remove();
            } else if (_this.tool === "circleFixed") {
                const r = 12;
                _this.drawCircleFixed(
                    _this.startCoords.x,
                    _this.startCoords.y,
                    r,
                    _this.drawcolor,
                    _this.thickness
                );
                _this.sendFunction({
                    t: _this.tool,
                    d: [_this.startCoords.x, _this.startCoords.y, r],
                    c: _this.drawcolor,
                    th: _this.thickness,
                });
                _this.svgContainer.find("circleFixed").remove();
            } else if (_this.tool === "recSelect") {
                _this.imgDragActive = true;
                if (_this.pressedKeys.shift) {
                    if (
                        (currentPos.x - _this.startCoords.x) *
                            (currentPos.y - _this.startCoords.y) >
                        0
                    ) {
                        currentPos = new Point(
                            currentPos.x,
                            _this.startCoords.y + (currentPos.x - _this.startCoords.x)
                        );
                    } else {
                        currentPos = new Point(
                            currentPos.x,
                            _this.startCoords.y - (currentPos.x - _this.startCoords.x)
                        );
                    }
                }

                const width = Math.abs(_this.startCoords.x - currentPos.x);
                const height = Math.abs(_this.startCoords.y - currentPos.y);
                const left =
                    _this.startCoords.x < currentPos.x ? _this.startCoords.x : currentPos.x;
                const top = _this.startCoords.y < currentPos.y ? _this.startCoords.y : currentPos.y;
                _this.mouseOverlay.css({ cursor: "default" });
                const imgDiv = $(
                    `<div class="dragMe" style="position:absolute; left: ${left}px; top: ${top}px; width: ${width}px; border: 2px dotted gray; overflow: hidden; height: ${height}px;" cursor:move;">
                    <canvas style="cursor:move; position:absolute; top:0px; left:0px;" width="${width}" height="${height}"></canvas>
                    <div style="position:absolute; right:5px; top:3px;">
                    <button draw="1" style="margin: 0px 0px; background: #03a9f4; padding: 5px; margin-top: 3px; color: white;" class="addToCanvasBtn btn btn-default">Drop</button>
                    <button style="margin: 0px 0px; background: #03a9f4; padding: 5px; margin-top: 3px; color: white;" class="xCanvasBtn btn btn-default">x</button>
                    </div>
                    </div>`
                );
                const dragCanvas = $(imgDiv).find("canvas");
                const dragOutOverlay = $(
                    `<div class="dragOutOverlay" style="position:absolute; left: ${left}px; top: ${top}px; width: ${width}px; height: ${height}px; background:white;"></div>`
                );
                _this.mouseOverlay.append(dragOutOverlay);
                _this.mouseOverlay.append(imgDiv);

                const destCanvasContext = dragCanvas[0].getContext("2d");
                destCanvasContext.drawImage(
                    _this.canvas,
                    left,
                    top,
                    width,
                    height,
                    0,
                    0,
                    width,
                    height
                );
                imgDiv
                    .find(".xCanvasBtn")
                    .off("click")
                    .click(function () {
                        _this.imgDragActive = false;
                        _this.refreshCursorAppearance();
                        imgDiv.remove();
                        dragOutOverlay.remove();
                    });
                imgDiv
                    .find(".addToCanvasBtn")
                    .off("click")
                    .click(function () {
                        _this.imgDragActive = false;
                        _this.refreshCursorAppearance();
                        const p = imgDiv.position();
                        const leftT = Math.round(p.left * 100) / 100;
                        const topT = Math.round(p.top * 100) / 100;
                        _this.drawId++;
                        _this.sendFunction({
                            t: _this.tool,
                            d: [left, top, leftT, topT, width, height],
                        });
                        _this.dragCanvasRectContent(left, top, leftT, topT, width, height);
                        imgDiv.remove();
                        dragOutOverlay.remove();
                    });
                imgDiv.draggable();
                _this.svgContainer.find("rect").remove();
            }
        };

        _this.mouseOverlay.on("mouseout", function (e) {
            if (ReadOnlyService.readOnlyActive) return;
            _this.triggerMouseOut();
        });

        _this.mouseOverlay.on("mouseover", function (e) {
            if (ReadOnlyService.readOnlyActive) return;
            _this.triggerMouseOver();
        });

        // On text container click (Add a new textbox)
        _this.textContainer.on("click", function (e) {
            const currentPos = Point.fromEvent(e);
            const fontsize = _this.thickness * 0.5;
            const txId = "tx" + +new Date();
            // const isStickyNote = _this.tool === "stickynote";
            const isStickyNote = _this.tool;
            const newLocalBox = false;
            _this.sendFunction({
                t: "addTextBox",
                d: [
                    _this.drawcolor,
                    _this.textboxBackgroundColor,
                    fontsize,
                    currentPos.x,
                    currentPos.y,
                    txId,
                    isStickyNote,
                    newLocalBox,
                ],
            });
            _this.addTextBox(
                _this.drawcolor,
                _this.textboxBackgroundColor,
                fontsize,
                currentPos.x,
                currentPos.y,
                txId,
                isStickyNote,
                true
            );
        });
    },
    /**
     * For drawing lines at 0,45,90° ....
     * @param {Point} currentPos
     * @returns {Point}
     */
    getRoundedAngles: function (currentPos) {
        const { startCoords } = this;

        // these transformations operate in the standard coordinate system
        // y goes from bottom to up, x goes left to right
        const dx = currentPos.x - startCoords.x; // browser x is reversed
        const dy = startCoords.y - currentPos.y;

        const angle = Math.atan2(dy, dx);
        const angle45 = Math.round(angle / _45_DEG_IN_RAD) * _45_DEG_IN_RAD;

        const dist = currentPos.distTo(startCoords);
        let outX = startCoords.x + dist * Math.cos(angle45);
        let outY = startCoords.y - dist * Math.sin(angle45);

        return new Point(outX, outY);
    },
    triggerMouseMove: function (e) {
        const _this = this;
        if (_this.imgDragActive) {
            return;
        }

        let currentPos = Point.fromEvent(e);

        window.requestAnimationFrame(function () {
            // update position
            currentPos = Point.fromEvent(e);

            if (_this.drawFlag) {
                if (_this.tool === "pen") {
                    _this.pushPointSmoothPen(currentPos.x, currentPos.y);
                } else if (_this.tool === "penArrow") {
                    _this.pushPointSmoothPenArrow(currentPos.x, currentPos.y);
                } else if (_this.tool === "penTab") {
                    _this.pushPointSmoothPenTab(currentPos.x, currentPos.y);
                } else if (_this.tool === "penDotted") {
                    _this.pushPointSmoothPenDotted(currentPos.x, currentPos.y);
                } else if (_this.tool === "penDottedArrow") {
                    _this.pushPointSmoothPenDottedArrow(currentPos.x, currentPos.y);
                } else if (_this.tool === "penDottedCircle") {
                    _this.pushPointSmoothPenDottedCircle(currentPos.x, currentPos.y);
                } else if (_this.tool === "penCircle") {
                    _this.pushPointSmoothPenCircle(currentPos.x, currentPos.y);
                } else if (_this.tool === "eraser") {
                    _this.drawEraserLine(
                        currentPos.x,
                        currentPos.y,
                        _this.prevPos.x,
                        _this.prevPos.y,
                        _this.thickness
                    );
                    _this.sendFunction({
                        t: _this.tool,
                        d: [currentPos.x, currentPos.y, _this.prevPos.x, _this.prevPos.y],
                        th: _this.thickness,
                    });
                }
            }

            if (_this.tool === "eraser") {
                const left = currentPos.x - _this.thickness;
                const top = currentPos.y - _this.thickness;
                if (_this.ownCursor) _this.ownCursor.css({ top: top + "px", left: left + "px" });
            } else if (_this.tool === "pen") {
                const left = currentPos.x - _this.thickness / 2;
                const top = currentPos.y - _this.thickness / 2;
                if (_this.ownCursor) _this.ownCursor.css({ top: top + "px", left: left + "px" });
            } else if (_this.tool === "penArrow") {
                const left = currentPos.x - _this.thickness / 2;
                const top = currentPos.y - _this.thickness / 2;
                if (_this.ownCursor) _this.ownCursor.css({ top: top + "px", left: left + "px" });
            } else if (_this.tool === "penTab") {
                const left = currentPos.x - _this.thickness / 2;
                const top = currentPos.y - _this.thickness / 2;
                if (_this.ownCursor) _this.ownCursor.css({ top: top + "px", left: left + "px" });
            } else if (_this.tool === "penDotted") {
                const left = currentPos.x - _this.thickness / 2;
                const top = currentPos.y - _this.thickness / 2;
                if (_this.ownCursor) _this.ownCursor.css({ top: top + "px", left: left + "px" });
            } else if (_this.tool === "penDottedArrow") {
                const left = currentPos.x - _this.thickness / 2;
                const top = currentPos.y - _this.thickness / 2;
                if (_this.ownCursor) _this.ownCursor.css({ top: top + "px", left: left + "px" });
            } else if (_this.tool === "penDottedCircle") {
                const left = currentPos.x - _this.thickness / 2;
                const top = currentPos.y - _this.thickness / 2;
                if (_this.ownCursor) _this.ownCursor.css({ top: top + "px", left: left + "px" });
            } else if (_this.tool === "penCircle") {
                const left = currentPos.x - _this.thickness / 2;
                const top = currentPos.y - _this.thickness / 2;
                if (_this.ownCursor) _this.ownCursor.css({ top: top + "px", left: left + "px" });
            } else if (_this.tool === "line") {
                if (_this.svgLine) {
                    let posToUse = currentPos;
                    if (_this.pressedKeys.shift) {
                        posToUse = _this.getRoundedAngles(currentPos);
                    }
                    _this.svgLine.setAttribute("x2", posToUse.x);
                    _this.svgLine.setAttribute("y2", posToUse.y);
                } else if (_this.tool === "dotted") {
                    if (_this.svgDottedLine) {
                        let posToUse = currentPos;
                        if (_this.pressedKeys.shift) {
                            posToUse = _this.getRoundedAngles(currentPos);
                        }
                        _this.svgDottedLine.setAttribute("x2", posToUse.x);
                        _this.svgDottedLine.setAttribute("y2", posToUse.y);
                    }
                } else if (_this.tool === "dottedArrow") {
                    if (_this.svgDottedLineArrow) {
                        let posToUse = currentPos;
                        if (_this.pressedKeys.shift) {
                            posToUse = _this.getRoundedAngles(currentPos);
                        }
                        _this.svgDottedLineArrow.setAttribute("x2", posToUse.x);
                        _this.svgDottedLineArrow.setAttribute("y2", posToUse.y);
                    }
                }
            } else if (_this.tool === "arrow") {
                if (_this.svgArrow) {
                    let posToUse = currentPos;
                    if (_this.pressedKeys.shift) {
                        posToUse = _this.getRoundedAngles(currentPos);
                    }
                    _this.svgArrow.setAttribute("x2", posToUse.x);
                    _this.svgArrow.setAttribute("y2", posToUse.y);
                }
            } else if (_this.tool === "arrowTab") {
                if (_this.svgArrowTab) {
                    let posToUse = currentPos;
                    if (_this.pressedKeys.shift) {
                        posToUse = _this.getRoundedAngles(currentPos);
                    }
                    _this.svgArrowTab.setAttribute("x2", posToUse.x);
                    _this.svgArrowTab.setAttribute("y2", posToUse.y);
                }
            } else if (_this.tool === "arrowDootedTab") {
                if (_this.svgArrowDootedTab) {
                    let posToUse = currentPos;
                    if (_this.pressedKeys.shift) {
                        posToUse = _this.getRoundedAngles(currentPos);
                    }
                    _this.svgArrowDootedTab.setAttribute("x2", posToUse.x);
                    _this.svgArrowDootedTab.setAttribute("y2", posToUse.y);
                }
            } else if (_this.tool === "rect" || (_this.tool === "recSelect" && _this.drawFlag)) {
                if (_this.svgRect) {
                    const width = Math.abs(currentPos.x - _this.startCoords.x);
                    let height = Math.abs(currentPos.y - _this.startCoords.y);
                    if (_this.pressedKeys.shift) {
                        height = width;
                        const x =
                            currentPos.x < _this.startCoords.x
                                ? _this.startCoords.x - width
                                : _this.startCoords.x;
                        const y =
                            currentPos.y < _this.startCoords.y
                                ? _this.startCoords.y - width
                                : _this.startCoords.y;
                        _this.svgRect.setAttribute("x", x);
                        _this.svgRect.setAttribute("y", y);
                    } else {
                        const x =
                            currentPos.x < _this.startCoords.x ? currentPos.x : _this.startCoords.x;
                        const y =
                            currentPos.y < _this.startCoords.y ? currentPos.y : _this.startCoords.y;
                        _this.svgRect.setAttribute("x", x);
                        _this.svgRect.setAttribute("y", y);
                    }

                    _this.svgRect.setAttribute("width", width);
                    _this.svgRect.setAttribute("height", height);
                }
            } else if (_this.tool === "circle") {
                const r = currentPos.distTo(_this.startCoords);
                if (_this.svgCirle) {
                    _this.svgCirle.setAttribute("r", r);
                }
            } else if (_this.tool === "circleFilled") {
                const r = currentPos.distTo(_this.startCoords);
                if (_this.svgCirleFilled) {
                    _this.svgCirle.setAttribute("r", r);
                }
            } else if (_this.tool === "circleFixed") {
                const r = 5;
                if (_this.svgCirleFixed) {
                    _this.svgCirlefixed.setAttribute("r", r);
                }
            }

            _this.prevPos = currentPos;
        });

        ThrottlingService.throttle(currentPos, () => {
            _this.lastPointerPosition = currentPos;
            _this.sendFunction({
                t: "cursor",
                event: "move",
                d: [currentPos.x, currentPos.y],
                username: _this.settings.username,
            });
        });
    },
    triggerMouseOver: function () {
        var _this = this;
        if (_this.imgDragActive) {
            return;
        }
        if (!_this.mouseover) {
            var color = _this.drawcolor;
            var widthHeight = _this.thickness;
            if (_this.tool === "eraser") {
                color = "#00000000";
                widthHeight = widthHeight * 2;
            }
            if (
                _this.tool === "eraser" ||
                _this.tool === "pen" ||
                _this.tool === "penDotted" ||
                _this.tool === "penArrow" ||
                _this.tool === "penTab" ||
                _this.tool === "penDottedArrow" ||
                _this.tool === "penDottedCircle" ||
                _this.tool === "penCircle"
            ) {
                _this.ownCursor = $(
                    '<div id="ownCursor" style="background:' +
                        color +
                        "; border:1px solid gray; position:absolute; width:" +
                        widthHeight +
                        "px; height:" +
                        widthHeight +
                        'px; border-radius:50%;"></div>'
                );
                _this.cursorContainer.append(_this.ownCursor);
            }
        }
        _this.mouseover = true;
    },
    triggerMouseOut: function () {
        var _this = this;
        if (_this.imgDragActive) {
            return;
        }
        _this.drawFlag = false;
        _this.mouseover = false;
        _this.ctx.globalCompositeOperation = _this.oldGCO;
        if (_this.ownCursor) _this.ownCursor.remove();
        _this.svgContainer.find("line").remove();
        _this.svgContainer.find("arrow").remove();
        _this.svgContainer.find("dotted").remove();
        _this.svgContainer.find("dottedArrow").remove();
        _this.svgContainer.find("arrowTab").remove();
        _this.svgContainer.find("arrowDootedTab").remove();
        _this.svgContainer.find("rect").remove();
        _this.svgContainer.find("circle").remove();
        _this.svgContainer.find("circleFixed").remove();
        _this.svgContainer.find("circleFilled").remove();
        _this.sendFunction({ t: "cursor", event: "out" });
    },
    redrawMouseCursor: function () {
        const _this = this;
        _this.triggerMouseOut();
        _this.triggerMouseOver();
        _this.triggerMouseMove({ offsetX: _this.prevPos.x, offsetY: _this.prevPos.y });
    },
    delKeyAction: function () {
        var _this = this;
        $.each(_this.mouseOverlay.find(".dragOutOverlay"), function () {
            var width = $(this).width();
            var height = $(this).height();
            var p = $(this).position();
            var left = Math.round(p.left * 100) / 100;
            var top = Math.round(p.top * 100) / 100;
            _this.drawId++;
            _this.sendFunction({ t: "eraseRec", d: [left, top, width, height] });
            _this.eraseRec(left, top, width, height);
        });
        _this.mouseOverlay.find(".xCanvasBtn").click(); //Remove all current drops
        _this.textContainer
            .find("#" + _this.latestActiveTextBoxId)
            .find(".removeIcon")
            .click();
    },
    escKeyAction: function () {
        var _this = this;
        if (!_this.drawFlag) {
            _this.svgContainer.empty();
        }
        _this.mouseOverlay.find(".xCanvasBtn").click(); //Remove all current drops
    },
    pushPointSmoothPen: function (X, Y) {
        var _this = this;
        if (_this.penSmoothLastCoords.length >= 8) {
            _this.penSmoothLastCoords = [
                _this.penSmoothLastCoords[2],
                _this.penSmoothLastCoords[3],
                _this.penSmoothLastCoords[4],
                _this.penSmoothLastCoords[5],
                _this.penSmoothLastCoords[6],
                _this.penSmoothLastCoords[7],
            ];
        }
        _this.penSmoothLastCoords.push(X, Y);
        if (_this.penSmoothLastCoords.length >= 8) {
            _this.drawPenSmoothLine(_this.penSmoothLastCoords, _this.drawcolor, _this.thickness);
            _this.sendFunction({
                t: _this.tool,
                d: _this.penSmoothLastCoords,
                c: _this.drawcolor,
                th: _this.thickness,
            });
        }
    },
    pushPointSmoothPenArrow: function (X, Y) {
        var _this = this;
        if (_this.penSmoothLastCoordsArrow.length >= 8) {
            _this.penSmoothLastCoordsArrow = [
                _this.penSmoothLastCoordsArrow[2],
                _this.penSmoothLastCoordsArrow[3],
                _this.penSmoothLastCoordsArrow[4],
                _this.penSmoothLastCoordsArrow[5],
                _this.penSmoothLastCoordsArrow[6],
                _this.penSmoothLastCoordsArrow[7],
            ];
        }
        _this.penSmoothLastCoordsArrow.push(X, Y);
        if (_this.penSmoothLastCoordsArrow.length >= 8) {
            _this.drawPenSmoothLineArrow(
                _this.penSmoothLastCoordsArrow,
                _this.drawcolor,
                _this.thickness,
                5,
                5,
                true,
                false
            );
            _this.sendFunction({
                t: _this.tool,
                d: _this.penSmoothLastCoordsArrow,
                c: _this.drawcolor,
                th: _this.thickness,
            });
        }
    },
    pushPointSmoothPenTab: function (X, Y) {
        var _this = this;
        if (_this.penSmoothLastCoordsTab.length >= 8) {
            _this.penSmoothLastCoordsTab = [
                _this.penSmoothLastCoordsTab[2],
                _this.penSmoothLastCoordsTab[3],
                _this.penSmoothLastCoordsTab[4],
                _this.penSmoothLastCoordsTab[5],
                _this.penSmoothLastCoordsTab[6],
                _this.penSmoothLastCoordsTab[7],
            ];
        }
        _this.penSmoothLastCoordsTab.push(X, Y);
        if (_this.penSmoothLastCoordsTab.length >= 8) {
            _this.drawPenSmoothLineTab(
                _this.penSmoothLastCoordsTab,
                _this.drawcolor,
                _this.thickness,
                5,
                5,
                true,
                false
            );
            _this.sendFunction({
                t: _this.tool,
                d: _this.penSmoothLastCoordsTab,
                c: _this.drawcolor,
                th: _this.thickness,
            });
        }
    },
    pushPointSmoothPenDotted: function (X, Y) {
        var _this = this;
        if (_this.penSmoothLastCoordsDotted.length >= 8) {
            _this.penSmoothLastCoordsDotted = [
                _this.penSmoothLastCoordsDotted[2],
                _this.penSmoothLastCoordsDotted[3],
                _this.penSmoothLastCoordsDotted[4],
                _this.penSmoothLastCoordsDotted[5],
                _this.penSmoothLastCoordsDotted[6],
                _this.penSmoothLastCoordsDotted[7],
            ];
        }
        _this.penSmoothLastCoordsDotted.push(X, Y);
        if (_this.penSmoothLastCoordsDotted.length >= 8) {
            _this.drawPenSmoothLineDotted(
                _this.penSmoothLastCoordsDotted,
                _this.drawcolor,
                _this.thickness
            );
            _this.sendFunction({
                t: _this.tool,
                d: _this.penSmoothLastCoordsDotted,
                c: _this.drawcolor,
                th: _this.thickness,
            });
        }
    },
    pushPointSmoothPenDottedArrow: function (X, Y) {
        var _this = this;
        if (_this.penSmoothLastCoordsDottedArrow.length >= 8) {
            _this.penSmoothLastCoordsDottedArrow = [
                _this.penSmoothLastCoordsDottedArrow[2],
                _this.penSmoothLastCoordsDottedArrow[3],
                _this.penSmoothLastCoordsDottedArrow[4],
                _this.penSmoothLastCoordsDottedArrow[5],
                _this.penSmoothLastCoordsDottedArrow[6],
                _this.penSmoothLastCoordsDottedArrow[7],
            ];
        }
        _this.penSmoothLastCoordsDottedArrow.push(X, Y);
        if (_this.penSmoothLastCoordsDottedArrow.length >= 8) {
            _this.drawPenSmoothLineDottedArrow(
                _this.penSmoothLastCoordsDottedArrow,
                _this.drawcolor,
                _this.thickness
            );
            _this.sendFunction({
                t: _this.tool,
                d: _this.penSmoothLastCoordsDottedArrow,
                c: _this.drawcolor,
                th: _this.thickness,
            });
        }
    },
    pushPointSmoothPenDottedCircle: function (X, Y) {
        var _this = this;
        if (_this.penSmoothLastCoordsDottedCircle.length >= 8) {
            _this.penSmoothLastCoordsDottedCircle = [
                _this.penSmoothLastCoordsDottedCircle[2],
                _this.penSmoothLastCoordsDottedCircle[3],
                _this.penSmoothLastCoordsDottedCircle[4],
                _this.penSmoothLastCoordsDottedCircle[5],
                _this.penSmoothLastCoordsDottedCircle[6],
                _this.penSmoothLastCoordsDottedCircle[7],
            ];
        }
        _this.penSmoothLastCoordsDottedCircle.push(X, Y);
        if (_this.penSmoothLastCoordsDottedCircle.length >= 8) {
            _this.drawPenSmoothLineDottedCircle(
                _this.penSmoothLastCoordsDottedCircle,
                _this.drawcolor,
                _this.thickness
            );
            _this.sendFunction({
                t: _this.tool,
                d: _this.penSmoothLastCoordsDottedCircle,
                c: _this.drawcolor,
                th: _this.thickness,
            });
        }
    },
    pushPointSmoothPenCircle: function (X, Y) {
        var _this = this;
        if (_this.penSmoothLastCoordsCircle.length >= 8) {
            _this.penSmoothLastCoordsCircle = [
                _this.penSmoothLastCoordsCircle[2],
                _this.penSmoothLastCoordsCircle[3],
                _this.penSmoothLastCoordsCircle[4],
                _this.penSmoothLastCoordsCircle[5],
                _this.penSmoothLastCoordsCircle[6],
                _this.penSmoothLastCoordsCircle[7],
            ];
        }
        _this.penSmoothLastCoordsCircle.push(X, Y);
        if (_this.penSmoothLastCoordsCircle.length >= 8) {
            _this.drawPenSmoothLineCircle(
                _this.penSmoothLastCoordsCircle,
                _this.drawcolor,
                _this.thickness
            );
            _this.sendFunction({
                t: _this.tool,
                d: _this.penSmoothLastCoordsCircle,
                c: _this.drawcolor,
                th: _this.thickness,
            });
        }
    },
    dragCanvasRectContent: function (xf, yf, xt, yt, width, height) {
        var tempCanvas = document.createElement("canvas");
        tempCanvas.width = width;
        tempCanvas.height = height;
        var tempCanvasContext = tempCanvas.getContext("2d");
        tempCanvasContext.drawImage(this.canvas, xf, yf, width, height, 0, 0, width, height);
        this.eraseRec(xf, yf, width, height);
        this.ctx.drawImage(tempCanvas, xt, yt);
    },
    eraseRec: function (fromX, fromY, width, height) {
        var _this = this;
        _this.ctx.beginPath();
        _this.ctx.rect(fromX, fromY, width, height);
        _this.ctx.fillStyle = "rgba(0,0,0,1)";
        _this.ctx.globalCompositeOperation = "destination-out";
        _this.ctx.fill();
        _this.ctx.closePath();
        _this.ctx.globalCompositeOperation = _this.oldGCO;
    },
    drawPenLine: function (fromX, fromY, toX, toY, color, thickness) {
        var _this = this;
        _this.ctx.beginPath();
        _this.ctx.moveTo(fromX, fromY);
        _this.ctx.lineTo(toX, toY);
        _this.ctx.strokeStyle = color;
        _this.ctx.lineWidth = thickness;
        _this.ctx.lineCap = _this.lineCap;
        _this.ctx.stroke();
        _this.ctx.closePath();
    },
    drawDotted: function (fromX, fromY, toX, toY, color, thickness, aWidth, aLength) {
        var _this = this;
        _this.ctx.setLineDash([aWidth, aLength]);
        _this.ctx.beginPath();
        _this.ctx.moveTo(fromX, fromY);
        _this.ctx.lineTo(toX, toY);
        _this.ctx.strokeStyle = color;
        _this.ctx.lineWidth = thickness;
        _this.ctx.lineCap = _this.lineCap;
        _this.ctx.stroke();
        _this.ctx.closePath();
        _this.ctx.setLineDash([0, 0]);
    },
    drawArrowhead: function (ctx, x, y, radians) {
        ctx.save();
        ctx.beginPath();
        ctx.translate(x, y);
        ctx.rotate(radians);
        ctx.moveTo(0, 0);
        ctx.lineTo(8, 20);
        ctx.lineTo(-8, 20);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
    },
    drawDottedArrow: function (
        fromX,
        fromY,
        toX,
        toY,
        color,
        thickness,
        Width,
        Length,
        aWidth,
        aLength,
        arrowStart,
        arrowEnd
    ) {
        var _this = this;

        _this.ctx.strokeStyle = color;
        _this.ctx.fillStyle = color;
        _this.ctx.lineWidth = thickness;
        _this.ctx.setLineDash([Width, Length]);
        // draw the line
        _this.ctx.beginPath();
        _this.ctx.moveTo(fromX, fromY);
        _this.ctx.lineTo(toX, toY);
        _this.ctx.stroke();
        _this.ctx.setTransform(1, 0, 0, 1, 0, 0);
        _this.ctx.setLineDash([0, 0]);
        // draw the starting arrowhead
        if (arrowStart) {
            var startRadians = Math.atan((toY - fromY) / (toX - fromX));
            startRadians += ((toX > fromX ? -90 : 90) * Math.PI) / 180;
            this.drawArrowhead(_this.ctx, fromX, fromY, startRadians);
            // draw the ending arrowhead
        }
        if (arrowEnd) {
            var endRadians = Math.atan((toY - fromY) / (this.x2 - this.x1));
            endRadians += ((toX > fromX ? 90 : -90) * Math.PI) / 180;
            this.drawArrowhead(_this.ctx, toX, toY, endRadians);
        }
        _this.ctx.setLineDash([0, 0]);

        //_this.ctx.beginPath();
        //_this.ctx.setLineDash([Width, Length]);
        //_this.ctx.moveTo(fromX, fromY);
        //_this.ctx.lineTo(toX, toY);
        //_this.ctx.strokeStyle = color;
        //_this.ctx.lineWidth = thickness;
        //_this.ctx.lineCap = _this.lineCap;
        //_this.ctx.stroke();
        //_this.ctx.closePath();
        //var dx = toX - fromX;
        //var dy = toY - fromY;
        //var angle = Math.atan2(dy, dx);
        //var length = Math.sqrt(dx * dx + dy * dy);
        //_this.ctx.translate(fromX, fromY);
        //_this.ctx.rotate(angle);
        //_this.ctx.beginPath();
        //_this.ctx.moveTo(0, 0);
        //_this.ctx.lineTo(length, 0);
        //if (arrowStart) {
        //    _this.ctx.moveTo(aLength, -aWidth);
        //    _this.ctx.lineTo(0, 0);
        //    _this.ctx.lineTo(aLength, aWidth);
        //}
        //if (arrowEnd) {
        //    _this.ctx.moveTo(length - aLength, -aWidth);
        //    _this.ctx.lineTo(length, 0);
        //    _this.ctx.lineTo(length - aLength, aWidth);
        //}
        //_this.ctx.stroke();
        //_this.ctx.setTransform(1, 0, 0, 1, 0, 0);
        //_this.ctx.closePath();

        //_this.ctx.setLineDash([0, 0]);
    },

    drawArrow: function (
        fromX,
        fromY,
        toX,
        toY,
        color,
        thickness,
        aWidth,
        aLength,
        arrowStart,
        arrowEnd
    ) {
        var _this = this;
        _this.ctx.beginPath();
        _this.ctx.moveTo(fromX, fromY);
        _this.ctx.lineTo(toX, toY);
        _this.ctx.strokeStyle = color;
        _this.ctx.lineWidth = thickness;
        _this.ctx.lineCap = _this.lineCap;
        _this.ctx.stroke();
        _this.ctx.closePath();

        var dx = toX - fromX;
        var dy = toY - fromY;
        var angle = Math.atan2(dy, dx);
        var length = Math.sqrt(dx * dx + dy * dy);
        _this.ctx.translate(fromX, fromY);
        _this.ctx.rotate(angle);
        _this.ctx.beginPath();
        _this.ctx.moveTo(0, 0);
        _this.ctx.lineTo(length, 0);
        if (arrowStart) {
            _this.ctx.moveTo(aLength, -aWidth);
            _this.ctx.lineTo(0, 0);
            _this.ctx.lineTo(aLength, aWidth);
        }
        if (arrowEnd) {
            _this.ctx.moveTo(length - aLength, -aWidth);
            _this.ctx.lineTo(length, 0);
            _this.ctx.lineTo(length - aLength, aWidth);
        }
        _this.ctx.stroke();
        _this.ctx.setTransform(1, 0, 0, 1, 0, 0);
        _this.ctx.closePath();
    },
    drawTab: function (
        fromX,
        fromY,
        toX,
        toY,
        color,
        thickness,
        aWidth,
        aLength,
        arrowStart,
        arrowEnd
    ) {
        var _this = this;
        _this.ctx.beginPath();
        _this.ctx.moveTo(fromX, fromY);
        _this.ctx.lineTo(toX, toY);
        _this.ctx.strokeStyle = color;
        _this.ctx.lineWidth = thickness;
        _this.ctx.lineCap = _this.lineCap;
        _this.ctx.stroke();
        _this.ctx.closePath();

        var dx = toX - fromX;
        var dy = toY - fromY;
        var angle = Math.atan2(dy, dx);
        var length = Math.sqrt(dx * dx + dy * dy);
        _this.ctx.translate(fromX, fromY);
        _this.ctx.rotate(angle);
        _this.ctx.beginPath();
        _this.ctx.moveTo(0, 0);
        _this.ctx.lineTo(length, 0);

        // move tab code here

        if (arrowStart) {
            _this.ctx.moveTo(-aLength, -aWidth);
            _this.ctx.lineTo(-aLength, 0);
            _this.ctx.lineTo(-aLength, aWidth - 1);
        }
        if (arrowEnd) {
            _this.ctx.moveTo(length - aLength, -aWidth);
            _this.ctx.lineTo(length, 0);
            _this.ctx.lineTo(length - aLength, aWidth);
        }

        _this.ctx.stroke();
        _this.ctx.setTransform(1, 0, 0, 1, 0, 0);
        _this.ctx.closePath();
    },
    drawArrowTab: function (
        fromX,
        fromY,
        toX,
        toY,
        color,
        thickness,
        aWidth,
        aLength,
        arrowStart,
        arrowEnd
    ) {
        var _this = this;
        _this.ctx.beginPath();
        _this.ctx.moveTo(fromX, fromY);
        _this.ctx.lineTo(toX, toY);
        _this.ctx.strokeStyle = color;
        _this.ctx.lineWidth = thickness;
        _this.ctx.lineCap = _this.lineCap;
        _this.ctx.stroke();
        _this.ctx.closePath();

        var dx = toX - fromX;
        var dy = toY - fromY;
        var angle = Math.atan2(dy, dx);
        var length = Math.sqrt(dx * dx + dy * dy);
        _this.ctx.translate(fromX, fromY);
        _this.ctx.rotate(angle);
        _this.ctx.beginPath();
        _this.ctx.moveTo(0, 0);
        _this.ctx.lineTo(length, 0);
        if (arrowStart) {
            _this.ctx.moveTo(-aLength, -aWidth);
            _this.ctx.lineTo(-aLength, 0);
            _this.ctx.lineTo(-aLength, aWidth - 1);
        }
        if (arrowEnd) {
            _this.ctx.moveTo(length - aLength, -aWidth);
            _this.ctx.lineTo(length, 0);
            _this.ctx.lineTo(length - aLength, aWidth);
        }
        _this.ctx.stroke();
        _this.ctx.setTransform(1, 0, 0, 1, 0, 0);
        _this.ctx.closePath();
    },
    drawArrowDootedTab: function (
        fromX,
        fromY,
        toX,
        toY,
        color,
        thickness,
        aWidth,
        aLength,
        arrowStart,
        arrowEnd
    ) {
        var _this = this;
        _this.ctx.beginPath();
        _this.ctx.setLineDash([5, 5]);
        _this.ctx.moveTo(fromX, fromY);
        _this.ctx.lineTo(toX, toY);
        _this.ctx.strokeStyle = color;
        _this.ctx.lineWidth = thickness;
        _this.ctx.lineCap = _this.lineCap;
        _this.ctx.stroke();
        _this.ctx.closePath();

        var dx = toX - fromX;
        var dy = toY - fromY;
        var angle = Math.atan2(dy, dx);
        var length = Math.sqrt(dx * dx + dy * dy);
        _this.ctx.translate(fromX, fromY);
        _this.ctx.rotate(angle);
        _this.ctx.beginPath();
        _this.ctx.moveTo(0, 0);
        _this.ctx.lineTo(length, 0);

        if (arrowStart) {
            _this.ctx.setLineDash([0, 0]);
            _this.ctx.moveTo(-aLength, -aWidth);
            _this.ctx.lineTo(-aLength, 0);
            _this.ctx.lineTo(-aLength, aWidth - 1);
            _this.ctx.setLineDash([5, 5]);
        }
        if (arrowEnd) {
            _this.ctx.setLineDash([0, 0]);
            _this.ctx.moveTo(length - aLength, -aWidth);
            _this.ctx.lineTo(length, 0);
            _this.ctx.lineTo(length - aLength, aWidth);
            _this.ctx.setLineDash([5, 5]);
        }
        _this.ctx.stroke();

        _this.ctx.setTransform(1, 0, 0, 1, 0, 0);
        _this.ctx.closePath();
    },
    drawPenSmoothLine: function (coords, color, thickness) {
        var _this = this;
        var xm1 = coords[0];
        var ym1 = coords[1];
        var x0 = coords[2];
        var y0 = coords[3];
        var x1 = coords[4];
        var y1 = coords[5];
        var x2 = coords[6];
        var y2 = coords[7];
        var length = Math.sqrt(Math.pow(x0 - x1, 2) + Math.pow(y0 - y1, 2));
        var steps = Math.ceil(length / 5);
        _this.ctx.beginPath();
        _this.ctx.moveTo(x0, y0);
        if (steps == 0) {
            _this.ctx.lineTo(x0, y0);
        }
        for (var i = 0; i < steps; i++) {
            var point = lanczosInterpolate(xm1, ym1, x0, y0, x1, y1, x2, y2, (i + 1) / steps);
            _this.ctx.lineTo(point[0], point[1]);
        }
        _this.ctx.strokeStyle = color;
        _this.ctx.lineWidth = thickness;
        _this.ctx.lineCap = _this.lineCap;
        _this.ctx.stroke();
        _this.ctx.closePath();
    },
    drawPenSmoothLineArrow: function (
        coords,
        color,
        thickness,
        aWidth,
        aLength,
        arrowStart,
        arrowEnd
    ) {
        var _this = this;
        var xm1 = coords[0];
        var ym1 = coords[1];
        var x0 = coords[2];
        var y0 = coords[3];
        var x1 = coords[4];
        var y1 = coords[5];
        var x2 = coords[6];
        var y2 = coords[7];
        var length = Math.sqrt(Math.pow(x0 - x1, 2) + Math.pow(y0 - y1, 2));
        var steps = Math.ceil(length / 5);
        _this.ctx.beginPath();
        _this.ctx.moveTo(x0, y0);

        if (steps == 0) {
            _this.ctx.lineTo(x0, y0);
        }
        for (var i = 0; i < steps; i++) {
            var point = lanczosInterpolate(xm1, ym1, x0, y0, x1, y1, x2, y2, (i + 1) / steps);
            _this.ctx.lineTo(point[0], point[1]);
            this.firstX = point[0];
            this.firstY = point[1];
        }
        _this.ctx.strokeStyle = color;
        _this.ctx.lineWidth = thickness;
        _this.ctx.lineCap = _this.lineCap;
        _this.ctx.stroke();
        _this.ctx.closePath();
    },
    drawPenSmoothLineTab: function (
        coords,
        color,
        thickness,
        aWidth,
        aLength,
        arrowStart,
        arrowEnd
    ) {
        var _this = this;
        var xm1 = coords[0];
        var ym1 = coords[1];
        var x0 = coords[2];
        var y0 = coords[3];
        var x1 = coords[4];
        var y1 = coords[5];
        var x2 = coords[6];
        var y2 = coords[7];
        var length = Math.sqrt(Math.pow(x0 - x1, 2) + Math.pow(y0 - y1, 2));
        var steps = Math.ceil(length / 5);
        _this.ctx.beginPath();
        _this.ctx.moveTo(x0, y0);

        if (steps == 0) {
            _this.ctx.lineTo(x0, y0);
        }
        for (var i = 0; i < steps; i++) {
            var point = lanczosInterpolate(xm1, ym1, x0, y0, x1, y1, x2, y2, (i + 1) / steps);
            _this.ctx.lineTo(point[0], point[1]);
            this.firstX = point[0];
            this.firstY = point[1];
        }
        _this.ctx.strokeStyle = color;
        _this.ctx.lineWidth = thickness;
        _this.ctx.lineCap = _this.lineCap;
        _this.ctx.stroke();
        _this.ctx.closePath();
    },
    drawPenSmoothLineDotted: function (coords, color, thickness) {
        var _this = this;
        _this.ctx.setLineDash([5, 5]);
        var xm1 = coords[0];
        var ym1 = coords[1];
        var x0 = coords[2];
        var y0 = coords[3];
        var x1 = coords[4];
        var y1 = coords[5];
        var x2 = coords[6];
        var y2 = coords[7];
        var length = Math.sqrt(Math.pow(x0 - x1, 2) + Math.pow(y0 - y1, 2));
        var steps = Math.ceil(length / 5);
        _this.ctx.beginPath();
        _this.ctx.moveTo(x0, y0);
        if (steps == 0) {
            _this.ctx.lineTo(x0, y0);
        }
        for (var i = 0; i < steps; i++) {
            var point = lanczosInterpolate(xm1, ym1, x0, y0, x1, y1, x2, y2, (i + 1) / steps);
            _this.ctx.lineTo(point[0], point[1]);
        }
        _this.ctx.strokeStyle = color;
        _this.ctx.lineWidth = thickness;
        _this.ctx.lineCap = _this.lineCap;
        _this.ctx.stroke();
        _this.ctx.closePath();
        _this.ctx.setLineDash([0, 0]);
    },
    drawPenSmoothLineDottedArrow: function (
        coords,
        color,
        thickness,
        aWidth,
        aLength,
        arrowStart,
        arrowEnd
    ) {
        var _this = this;
        _this.ctx.setLineDash([_this.thickness, _this.thickness]);
        var xm1 = coords[0];
        var ym1 = coords[1];
        var x0 = coords[2];
        var y0 = coords[3];
        var x1 = coords[4];
        var y1 = coords[5];
        var x2 = coords[6];
        var y2 = coords[7];
        var length = Math.sqrt(Math.pow(x0 - x1, 2) + Math.pow(y0 - y1, 2));
        var steps = Math.ceil(length / 5);
        _this.ctx.beginPath();
        _this.ctx.moveTo(x0, y0);
        if (steps == 0) {
            _this.ctx.lineTo(x0, y0);
        }
        for (var i = 0; i < steps; i++) {
            var point = lanczosInterpolate(xm1, ym1, x0, y0, x1, y1, x2, y2, (i + 1) / steps);
            _this.ctx.lineTo(point[0], point[1]);
            this.DottedfirstX = point[0];
            this.DottedfirstY = point[1];
        }
        _this.ctx.strokeStyle = color;
        _this.ctx.lineWidth = thickness;
        _this.ctx.lineCap = _this.lineCap;
        _this.ctx.stroke();
        _this.ctx.closePath();
        _this.ctx.setLineDash([0, 0]);

        var dx = toX - fromX;
        var dy = toY - fromY;
        var angle = Math.atan2(dy, dx);
        var length = Math.sqrt(dx * dx + dy * dy);
        _this.ctx.translate(fromX, fromY);
        _this.ctx.rotate(angle);
        _this.ctx.beginPath();
        _this.ctx.moveTo(0, 0);
        _this.ctx.lineTo(length, 0);
        if (arrowStart) {
            _this.ctx.moveTo(-aLength, -aWidth);
            _this.ctx.lineTo(-aLength, 0);
            _this.ctx.lineTo(-aLength, aWidth - 1);
        }
        if (arrowEnd) {
            _this.ctx.moveTo(length - aLength, -aWidth);
            _this.ctx.lineTo(length, 0);
            _this.ctx.lineTo(length - aLength, aWidth);
        }
        _this.ctx.stroke();
        _this.ctx.setTransform(1, 0, 0, 1, 0, 0);
        _this.ctx.closePath();
    },
    drawPenSmoothLineDottedCircle: function (
        coords,
        color,
        thickness,
        aWidth,
        aLength,
        arrowStart,
        arrowEnd
    ) {
        var _this = this;
        _this.ctx.setLineDash([_this.thickness, _this.thickness]);
        var xm1 = coords[0];
        var ym1 = coords[1];
        var x0 = coords[2];
        var y0 = coords[3];
        var x1 = coords[4];
        var y1 = coords[5];
        var x2 = coords[6];
        var y2 = coords[7];
        var length = Math.sqrt(Math.pow(x0 - x1, 2) + Math.pow(y0 - y1, 2));
        var steps = Math.ceil(length / 5);
        _this.ctx.beginPath();
        _this.ctx.moveTo(x0, y0);
        if (steps == 0) {
            _this.ctx.lineTo(x0, y0);
        }
        for (var i = 0; i < steps; i++) {
            var point = lanczosInterpolate(xm1, ym1, x0, y0, x1, y1, x2, y2, (i + 1) / steps);
            _this.ctx.lineTo(point[0], point[1]);
            this.DottedfirstX = point[0];
            this.DottedfirstY = point[1];
        }
        _this.ctx.strokeStyle = color;
        _this.ctx.lineWidth = thickness;
        _this.ctx.lineCap = _this.lineCap;
        _this.ctx.stroke();
        _this.ctx.closePath();
        _this.ctx.setLineDash([0, 0]);

        //var _this = this;
        //_this.ctx.beginPath();
        //_this.ctx.arc(this.DottedfirstX, this.DottedfirstY, 5 * thickness, 0, 2 * Math.PI, false);
        //_this.ctx.lineWidth = thickness;
        //_this.ctx.strokeStyle = color;
        //_this.ctx.fillStyle = color;
        //_this.ctx.stroke();

        //var dx = toX - fromX;
        //var dy = toY - fromY;
        //var angle = Math.atan2(dy, dx);
        //var length = Math.sqrt(dx * dx + dy * dy);
        //_this.ctx.translate(fromX, fromY);
        //_this.ctx.rotate(angle);
        //_this.ctx.beginPath();
        //_this.ctx.moveTo(0, 0);
        //_this.ctx.lineTo(length, 0);
        //if (arrowStart) {
        //    _this.ctx.moveTo(-aLength, -aWidth);
        //    _this.ctx.lineTo(-aLength, 0);
        //    _this.ctx.lineTo(-aLength, aWidth - 1);
        //}
        //if (arrowEnd) {
        //    _this.ctx.moveTo(length - aLength, -aWidth);
        //    _this.ctx.lineTo(length, 0);
        //    _this.ctx.lineTo(length - aLength, aWidth);
        //}
        //_this.ctx.stroke();
        //_this.ctx.setTransform(1, 0, 0, 1, 0, 0);
        //_this.ctx.closePath();
    },
    drawPenSmoothLineCircle: function (
        coords,
        color,
        thickness,
        aWidth,
        aLength,
        arrowStart,
        arrowEnd
    ) {
        var _this = this;
        var xm1 = coords[0];
        var ym1 = coords[1];
        var x0 = coords[2];
        var y0 = coords[3];
        var x1 = coords[4];
        var y1 = coords[5];
        var x2 = coords[6];
        var y2 = coords[7];
        var length = Math.sqrt(Math.pow(x0 - x1, 2) + Math.pow(y0 - y1, 2));
        var steps = Math.ceil(length / 5);
        _this.ctx.beginPath();
        _this.ctx.moveTo(x0, y0);
        if (steps == 0) {
            _this.ctx.lineTo(x0, y0);
        }
        for (var i = 0; i < steps; i++) {
            var point = lanczosInterpolate(xm1, ym1, x0, y0, x1, y1, x2, y2, (i + 1) / steps);
            _this.ctx.lineTo(point[0], point[1]);
            this.DottedfirstX = point[0];
            this.DottedfirstY = point[1];
        }
        _this.ctx.strokeStyle = color;
        _this.ctx.lineWidth = thickness;
        _this.ctx.lineCap = _this.lineCap;
        _this.ctx.stroke();
        _this.ctx.closePath();
        _this.ctx.setLineDash([0, 0]);

        //var _this = this;
        //_this.ctx.beginPath();
        //_this.ctx.arc(this.DottedfirstX, this.DottedfirstY, 5 * thickness, 0, 2 * Math.PI, false);
        //_this.ctx.lineWidth = thickness;
        //_this.ctx.strokeStyle = color;
        //_this.ctx.fillStyle = color;
        //_this.ctx.stroke();

        //var dx = toX - fromX;
        //var dy = toY - fromY;
        //var angle = Math.atan2(dy, dx);
        //var length = Math.sqrt(dx * dx + dy * dy);
        //_this.ctx.translate(fromX, fromY);
        //_this.ctx.rotate(angle);
        //_this.ctx.beginPath();
        //_this.ctx.moveTo(0, 0);
        //_this.ctx.lineTo(length, 0);
        //if (arrowStart) {
        //    _this.ctx.moveTo(-aLength, -aWidth);
        //    _this.ctx.lineTo(-aLength, 0);
        //    _this.ctx.lineTo(-aLength, aWidth - 1);
        //}
        //if (arrowEnd) {
        //    _this.ctx.moveTo(length - aLength, -aWidth);
        //    _this.ctx.lineTo(length, 0);
        //    _this.ctx.lineTo(length - aLength, aWidth);
        //}
        //_this.ctx.stroke();
        //_this.ctx.setTransform(1, 0, 0, 1, 0, 0);
        //_this.ctx.closePath();
    },
    drawEraserLine: function (fromX, fromY, toX, toY, thickness) {
        var _this = this;
        _this.ctx.beginPath();
        _this.ctx.moveTo(fromX, fromY);
        _this.ctx.lineTo(toX, toY);
        _this.ctx.strokeStyle = "rgba(0,0,0,1)";
        _this.ctx.lineWidth = thickness * 2;
        _this.ctx.lineCap = _this.lineCap;
        _this.ctx.globalCompositeOperation = "destination-out";
        _this.ctx.stroke();
        _this.ctx.closePath();
        _this.ctx.globalCompositeOperation = _this.oldGCO;
    },
    drawRec: function (fromX, fromY, toX, toY, color, thickness) {
        var _this = this;
        toX = toX - fromX;
        toY = toY - fromY;
        _this.ctx.beginPath();
        _this.ctx.rect(fromX, fromY, toX, toY);
        _this.ctx.strokeStyle = color;
        _this.ctx.lineWidth = thickness;
        _this.ctx.lineCap = _this.lineCap;
        _this.ctx.stroke();
        _this.ctx.closePath();
    },
    drawCircle: function (fromX, fromY, radius, color, thickness) {
        var _this = this;
        _this.ctx.beginPath();
        _this.ctx.arc(fromX, fromY, radius, 0, 2 * Math.PI, false);
        _this.ctx.lineWidth = thickness;
        _this.ctx.strokeStyle = color;
        _this.ctx.stroke();
    },
    drawCircleFilled: function (fromX, fromY, radius, color, thickness) {
        var _this = this;
        _this.ctx.beginPath();
        _this.ctx.arc(fromX, fromY, radius, 0, 2 * Math.PI, false);
        _this.ctx.lineWidth = thickness;
        _this.ctx.strokeStyle = color;
        _this.ctx.fillStyle = color;
        _this.ctx.fill();
        _this.ctx.stroke();
    },
    drawCircleFixed: function (fromX, fromY, radius, color, thickness) {
        var _this = this;
        console.log(radius * thickness);
        console.log(25 * thickness);
        console.log("fixed circke end ");
        _this.ctx.beginPath();
        _this.ctx.arc(fromX, fromY, radius * thickness, 0, 2 * Math.PI, false);
        _this.ctx.lineWidth = thickness;
        _this.ctx.strokeStyle = color;
        _this.ctx.stroke();
    },
    drawCircleFixedFilled: function (fromX, fromY, radius, color, thickness) {
        var _this = this;
        var rd = radius * thickness;
        if (rd <= 0) {
            rd = 1;
        }
        _this.ctx.beginPath();
        _this.ctx.arc(fromX, fromY, rd, 0, 2 * Math.PI, false);
        _this.ctx.lineWidth = thickness;
        _this.ctx.strokeStyle = color;
        _this.ctx.fillStyle = color;
        _this.ctx.fill();
        _this.ctx.stroke();
    },
    clearWhiteboard: function () {
        var _this = this;
        if (ReadOnlyService.readOnlyActive) return;
        _this.canvas.height = _this.canvas.height;
        _this.imgContainer.empty();
        _this.textContainer.empty();
        _this.sendFunction({ t: "clear" });
        _this.drawBuffer = [];
        _this.undoBuffer = [];
        _this.drawId = 0;
    },
    setStrokeThickness(thickness) {
        var _this = this;
        _this.thickness = thickness;

        if (
            (_this.tool == "text" ||
                this.tool === "stickynote" ||
                this.tool === "soccerPlayer" ||
                this.tool === "circleWithCross" ||
                this.tool === "Cross" ||
                this.tool === "CenterCross" ||
                this.tool === "RightCross" ||
                this.tool === "leftCross") &&
            _this.latestActiveTextBoxId
        ) {
            _this.sendFunction({
                t: "setTextboxFontSize",
                d: [_this.latestActiveTextBoxId, thickness],
            });
            _this.setTextboxFontSize(_this.latestActiveTextBoxId, thickness);
        }
    },
    imgWithSrc(url) {
        return $(
            DOMPurify.sanitize('<img src="' + url + '">', {
                ALLOWED_TAGS: ["img"],
                ALLOWED_ATTR: ["src"], // kill any attributes malicious url introduced
            })
        );
    },
    addImgToCanvasByUrl: function (url) {
        var _this = this;
        var oldTool = _this.tool;

        const { imageURL } = ConfigService;
        var finalURL = url;
        if (imageURL && url.startsWith("/uploads/")) {
            finalURL = imageURL + url;
        }

        var img = this.imgWithSrc(finalURL).css({ width: "100%", height: "100%" });
        finalURL = img.attr("src");

        _this.setTool("mouse"); //Set to mouse tool while dropping to prevent errors
        _this.imgDragActive = true;
        _this.mouseOverlay.css({ cursor: "default" });
        var imgDiv = $(
            '<div class="dragMe" style="border: 2px dashed gray; position:absolute; left:200px; top:200px; min-width:160px; min-height:100px; cursor:move;">' +
                '<div style="position:absolute; right:5px; top:3px;">' +
                '<button draw="1" style="margin: 0px 0px; background: #03a9f4; padding: 5px; margin-top: 3px; color: white;" class="addToCanvasBtn btn btn-default">Draw to canvas</button> ' +
                '<button draw="0" style="margin: 0px 0px; background: #03a9f4; padding: 5px; margin-top: 3px; color: white;" class="addToBackgroundBtn btn btn-default">Add to background</button> ' +
                '<button style="margin: 0px 0px; background: #03a9f4; padding: 5px; margin-top: 3px; color: white;" class="xCanvasBtn btn btn-default">x</button>' +
                "</div>" +
                '<i style="position:absolute; bottom: -4px; right: 2px; font-size: 2em; color: gray; transform: rotate(-45deg);" class="fas fa-sort-down" aria-hidden="true"></i>' +
                '<div class="rotationHandle" style="position:absolute; bottom: -30px; left: 0px; width:100%; text-align:center; cursor:ew-resize;"><i class="fa fa-undo"></i></div>' +
                "</div>"
        );
        imgDiv.prepend(img);
        imgDiv
            .find(".xCanvasBtn")
            .off("click")
            .click(function () {
                _this.imgDragActive = false;
                _this.refreshCursorAppearance();
                imgDiv.remove();
                _this.setTool(oldTool);
            });
        var rotationAngle = 0;
        var recoupLeft = 0;
        var recoupTop = 0;
        var p = imgDiv.position();
        var left = 200;
        var top = 200;
        imgDiv
            .find(".addToCanvasBtn,.addToBackgroundBtn")
            .off("click")
            .click(function () {
                var draw = $(this).attr("draw");
                _this.imgDragActive = false;

                var width = imgDiv.width();
                var height = imgDiv.height();

                if (draw == "1") {
                    //draw image to canvas
                    _this.drawImgToCanvas(finalURL, width, height, left, top, rotationAngle);
                } else {
                    //Add image to background
                    _this.drawImgToBackground(finalURL, width, height, left, top, rotationAngle);
                }
                _this.sendFunction({
                    t: "addImgBG",
                    draw: draw,
                    url: finalURL,
                    d: [width, height, left, top, rotationAngle],
                });
                _this.drawId++;
                imgDiv.remove();
                _this.refreshCursorAppearance();
                _this.setTool(oldTool);
            });
        _this.mouseOverlay.append(imgDiv);

        imgDiv.draggable({
            start: function (event, ui) {
                var left = parseInt($(this).css("left"), 10);
                left = isNaN(left) ? 0 : left;
                var top = parseInt($(this).css("top"), 10);
                top = isNaN(top) ? 0 : top;
                recoupLeft = left - ui.position.left;
                recoupTop = top - ui.position.top;
            },
            drag: function (event, ui) {
                ui.position.left += recoupLeft;
                ui.position.top += recoupTop;
            },
            stop: function (event, ui) {
                left = ui.position.left;
                top = ui.position.top;
            },
        });
        imgDiv.resizable();
        var params = {
            // Callback fired on rotation start.
            start: function (event, ui) {},
            // Callback fired during rotation.
            rotate: function (event, ui) {
                //console.log(ui)
            },
            // Callback fired on rotation end.
            stop: function (event, ui) {
                rotationAngle = ui.angle.current;
            },
            handle: imgDiv.find(".rotationHandle"),
        };
        imgDiv.rotatable(params);

        // render newly added icons
        dom.i2svg();
    },

    addImgToCanvasByUrl: function (url) {
        var _this = this;
        var oldTool = _this.tool;

        const { imageURL } = ConfigService;
        var finalURL = url;
        if (imageURL && url.startsWith("../../")) {
            finalURL = imageURL + url;
        }

        var img = this.imgWithSrc(finalURL).css({ width: "100%", height: "100%" });
        finalURL = img.attr("src");

        _this.setTool("mouse"); //Set to mouse tool while dropping to prevent errors
        _this.imgDragActive = true;
        _this.mouseOverlay.css({ cursor: "default" });
        var imgDiv = $(
            '<div class="dragMe" style="border: 2px dashed gray; position:absolute; left:200px; top:200px; min-width:160px; min-height:100px; cursor:move;">' +
                '<div style="position:absolute; right:5px; top:3px;">' +
                '<button draw="1" style="margin: 0px 0px; background: #03a9f4; padding: 5px; margin-top: 3px; color: white;" class="addToCanvasBtn btn btn-default">Draw to canvas</button> ' +
                '<button draw="0" style="margin: 0px 0px; background: #03a9f4; padding: 5px; margin-top: 3px; color: white;" class="addToBackgroundBtn btn btn-default">Add to background</button> ' +
                '<button style="margin: 0px 0px; background: #03a9f4; padding: 5px; margin-top: 3px; color: white;" class="xCanvasBtn btn btn-default">x</button>' +
                "</div>" +
                '<i style="position:absolute; bottom: -4px; right: 2px; font-size: 2em; color: gray; transform: rotate(-45deg);" class="fas fa-sort-down" aria-hidden="true"></i>' +
                '<div class="rotationHandle" style="position:absolute; bottom: -30px; left: 0px; width:100%; text-align:center; cursor:ew-resize;"><i class="fa fa-undo"></i></div>' +
                "</div>"
        );
        imgDiv.prepend(img);
        imgDiv
            .find(".xCanvasBtn")
            .off("click")
            .click(function () {
                _this.imgDragActive = false;
                _this.refreshCursorAppearance();
                imgDiv.remove();
                _this.setTool(oldTool);
            });
        var rotationAngle = 0;
        var recoupLeft = 0;
        var recoupTop = 0;
        var p = imgDiv.position();
        var left = 200;
        var top = 200;
        imgDiv
            .find(".addToCanvasBtn,.addToBackgroundBtn")
            .off("click")
            .click(function () {
                var draw = $(this).attr("draw");
                _this.imgDragActive = false;

                var width = imgDiv.width();
                var height = imgDiv.height();

                if (draw == "1") {
                    //draw image to canvas
                    _this.drawImgToCanvas(finalURL, width, height, left, top, rotationAngle);
                } else {
                    //Add image to background
                    _this.drawImgToBackground(finalURL, width, height, left, top, rotationAngle);
                }
                _this.sendFunction({
                    t: "addImgBG",
                    draw: draw,
                    url: finalURL,
                    d: [width, height, left, top, rotationAngle],
                });
                _this.drawId++;
                imgDiv.remove();
                _this.refreshCursorAppearance();
                _this.setTool(oldTool);
            });
        _this.mouseOverlay.append(imgDiv);

        imgDiv.draggable({
            start: function (event, ui) {
                var left = parseInt($(this).css("left"), 10);
                left = isNaN(left) ? 0 : left;
                var top = parseInt($(this).css("top"), 10);
                top = isNaN(top) ? 0 : top;
                recoupLeft = left - ui.position.left;
                recoupTop = top - ui.position.top;
            },
            drag: function (event, ui) {
                ui.position.left += recoupLeft;
                ui.position.top += recoupTop;
            },
            stop: function (event, ui) {
                left = ui.position.left;
                top = ui.position.top;
            },
        });
        imgDiv.resizable();
        var params = {
            // Callback fired on rotation start.
            start: function (event, ui) {},
            // Callback fired during rotation.
            rotate: function (event, ui) {
                //console.log(ui)
            },
            // Callback fired on rotation end.
            stop: function (event, ui) {
                rotationAngle = ui.angle.current;
            },
            handle: imgDiv.find(".rotationHandle"),
        };
        imgDiv.rotatable(params);

        // render newly added icons
        dom.i2svg();
    },
    drawImgToBackground(url, width, height, left, top, rotationAngle) {
        const px = (v) => Number(v).toString() + "px";
        this.imgContainer.append(
            this.imageWithSrc(url).css({
                width: px(width),
                height: px(height),
                top: px(top),
                left: px(left),
                position: "absolute",
                transform: "rotate(" + Number(rotationAngle) + "rad)",
            })
        );
    },
    addTextBox(
        textcolor,
        textboxBackgroundColor,
        fontsize,
        left,
        top,
        txId,
        isStickyNote,
        newLocalBox
    ) {
        var _this = this;
        console.log(fontsize * 50);
        console.log("svg end ");
        var cssclass = "textBox";
        var textBox = "";
        if (isStickyNote == "stickynote") {
            cssclass += " stickyNote";
            textBox = $(
                '<div id="' +
                    txId +
                    '" class="' +
                    cssclass +
                    '" style="font-family: Monospace; position:absolute; top:' +
                    top +
                    "px; left:" +
                    left +
                    "px;" +
                    "background-color:" +
                    textboxBackgroundColor +
                    ';">' +
                    '<div contentEditable="true" spellcheck="false" class="textContent" style="outline: none; font-size:' +
                    fontsize +
                    "em; color:" +
                    textcolor +
                    '; min-width:50px; min-height:50px"></div>' +
                    '<div title="remove textbox" class="removeIcon" style="position:absolute; cursor:pointer; top:-4px; right:2px;">x</div>' +
                    '<div title="move textbox" class="moveIcon" style="position:absolute; cursor:move; top:1px; left:2px; font-size: 0.5em;"><i class="fas fa-expand-arrows-alt"></i></div>' +
                    "</div>"
            );
        } else if (isStickyNote == "text") {
            textBox = $(
                '<div id="' +
                    txId +
                    '" class=" ' +
                    cssclass +
                    '" style="font-family: Monospace; position:absolute; top:' +
                    top +
                    "px; left:" +
                    left +
                    "px;" +
                    ';">' +
                    '<div contentEditable="true" spellcheck="false" class="textContent" style="outline: none; font-size:' +
                    fontsize +
                    "em; color:" +
                    textcolor +
                    '; min-width:50px; min-height:50px"></div>' +
                    '<div title="remove textbox" class="removeIcon" style="position:absolute; cursor:pointer; top:-4px; right:2px;">x</div>' +
                    '<div title="move textbox" class="moveIcon " style="position:absolute; cursor:move; top:1px; left:2px; font-size: 0.5em;"><i class="fas fa-expand-arrows-alt"></i></div>' +
                    "</div>"
            );
        } else if (isStickyNote == "soccerPlayer") {
            textBox = $(
                '<div id="' +
                    txId +
                    '" class=" ' +
                    cssclass +
                    '" style="font-family: Monospace; position:absolute; top:' +
                    top +
                    "px; left:" +
                    left +
                    "px;" +
                    ';">' +
                    '<div contentEditable="false" spellcheck="false" class="" style="outline: none; font-size:' +
                    fontsize +
                    "em; color:" +
                    textcolor +
                    '; min-width:50px; min-height:50px">' +
                    '<img src="./images/player.png" alt="Girl in a jacket" width="' +
                    fontsize * 50 +
                    '" height="' +
                    fontsize * 50 +
                    '">' +
                    "</div > " +
                    '<div title="remove textbox" class="removeIcon" style="position:absolute; cursor:pointer; top:-4px; right:2px;">x</div>' +
                    '<div title="move textbox" class="moveIcon " style="position:absolute; cursor:move; top:1px; left:2px; font-size: 0.5em;"><i class="fas fa-expand-arrows-alt"></i></div>' +
                    "</div>"
            );
        } else if (isStickyNote == "circleWithCross") {
            textBox = $(
                '<div id="' +
                    txId +
                    '" class="hotqcontent ' +
                    cssclass +
                    '" style="font-family: Monospace; position:absolute; top:' +
                    top +
                    "px; left:" +
                    left +
                    "px;" +
                    ';">' +
                    '<div contentEditable="false" spellcheck="false" class="" style="outline: none; font-size:' +
                    fontsize +
                    "em; color:" +
                    textcolor +
                    '; min-width:50px; min-height:50px">' +
                    '<svg version="1.1" id="Capa_1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" x="0px" y="0px" width="' +
                    fontsize * 50 +
                    '" height="' +
                    fontsize * 50 +
                    '"	 viewBox = "0 0 330 330" style = "fill:' +
                    textcolor +
                    ";color:" +
                    textcolor +
                    '; enable-background:new 0 0 330 330;" xml: space = "preserve" ><g>	<path d="M165,0C74.019,0,0,74.019,0,165s74.019,165,165,165c90.982,0,165-74.019,165-165S255.982,0,165,0z M165,300		c-74.439,0-135-60.561-135-135S90.561,30,165,30c74.439,0,135,60.561,135,135S239.439,300,165,300z"/>	<path d="M239.247,90.754c-5.857-5.858-15.355-5.858-21.213,0l-53.033,53.033l-53.033-53.033c-5.857-5.858-15.355-5.858-21.213,0		c-5.858,5.858-5.858,15.355,0,21.213L143.788,165l-53.033,53.033c-5.858,5.858-5.858,15.355,0,21.213		c2.929,2.929,6.768,4.394,10.606,4.394c3.839,0,7.678-1.464,10.606-4.394l53.033-53.033l53.033,53.033		c2.929,2.929,6.768,4.394,10.606,4.394c3.839,0,7.678-1.464,10.607-4.394c5.858-5.858,5.858-15.355,0-21.213L186.214,165		l53.033-53.033C245.105,106.109,245.105,96.612,239.247,90.754z"/></g><g></g><g></g><g></g><g></g><g></g><g></g><g></g><g></g><g></g><g></g><g></g><g></g><g></g><g></g><g></g></svg >' +
                    "</div > " +
                    '<div title="remove textbox" class="removeIcon nested" style="position:absolute;  cursor:pointer; top:-4px; right:2px;">x</div>' +
                    '<div title="move textbox" class="moveIcon nested" style="position:absolute; cursor:move; top:1px; left:2px; font-size: 0.5em;"><i class="fas fa-expand-arrows-alt"></i></div>' +
                    "</div>"
            );
        } else if (isStickyNote == "Cross") {
            textBox = $(
                '<div id="' +
                    txId +
                    '" class="hotqcontent ' +
                    cssclass +
                    '" style="font-family: Monospace; position:absolute; top:' +
                    top +
                    "px; left:" +
                    left +
                    "px;" +
                    ';">' +
                    '<div contentEditable="false" spellcheck="false" class="" style="outline: none; font-size:' +
                    fontsize +
                    "em; color:" +
                    textcolor +
                    '; min-width:50px; min-height:50px">' +
                    '<svg style = "fill:' +
                    textcolor +
                    ";color:" +
                    textcolor +
                    ';"  width="' +
                    fontsize * 50 +
                    '" height="' +
                    fontsize * 50 +
                    '" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg"><g id="cancel"><path  d="M28,29a1,1,0,0,1-.71-.29l-24-24A1,1,0,0,1,4.71,3.29l24,24a1,1,0,0,1,0,1.42A1,1,0,0,1,28,29Z"/><path class="cls-1" d="M4,29a1,1,0,0,1-.71-.29,1,1,0,0,1,0-1.42l24-24a1,1,0,1,1,1.42,1.42l-24,24A1,1,0,0,1,4,29Z"/></g></svg>' +
                    "</div > " +
                    '<div title="remove textbox" class="removeIcon nested" style="position:absolute;  cursor:pointer; top:-4px; right:2px;">x</div>' +
                    '<div title="move textbox" class="moveIcon nested" style="position:absolute; cursor:move; top:1px; left:2px; font-size: 0.5em;"><i class="fas fa-expand-arrows-alt"></i></div>' +
                    "</div>"
            );
        } else if (isStickyNote == "CenterCross") {
            textBox = $(
                '<div id="' +
                    txId +
                    '" class="hotqcontent ' +
                    cssclass +
                    '" style="font-family: Monospace; position:absolute; top:' +
                    top +
                    "px; left:" +
                    left +
                    "px;" +
                    ';">' +
                    '<div contentEditable="false" spellcheck="false" class="" style="outline: none; font-size:' +
                    fontsize +
                    "em; color:" +
                    textcolor +
                    '; min-width:50px; min-height:50px"><img src="./images/CenterCross.png" alt="Girl in a jacket" width="' +
                    fontsize * 50 +
                    '" height="' +
                    fontsize * 25 +
                    '"></div>' +
                    '<div title="remove textbox" class="removeIcon nested" style="position:absolute;  cursor:pointer; top:-4px; right:2px;">x</div>' +
                    '<div title="move textbox" class="moveIcon nested" style="position:absolute; cursor:move; top:1px; left:2px; font-size: 0.5em;"><i class="fas fa-expand-arrows-alt"></i></div>' +
                    "</div>"
            );
        } else if (isStickyNote == "leftCross") {
            textBox = $(
                '<div id="' +
                    txId +
                    '" class="hotqcontent ' +
                    cssclass +
                    '" style="font-family: Monospace; position:absolute; top:' +
                    top +
                    "px; left:" +
                    left +
                    "px;" +
                    ';">' +
                    '<div contentEditable="false" spellcheck="false" class="" style="outline: none; font-size:' +
                    fontsize +
                    "em; color:" +
                    textcolor +
                    '; min-width:50px; min-height:50px"><img src="./images/leftCross.png" alt="Girl in a jacket" width="' +
                    fontsize * 50 +
                    '" height="' +
                    fontsize * 25 +
                    '"></div>' +
                    '<div title="remove textbox" class="removeIcon nested" style="position:absolute;  cursor:pointer; top:-4px; right:2px;">x</div>' +
                    '<div title="move textbox" class="moveIcon nested" style="position:absolute; cursor:move; top:1px; left:2px; font-size: 0.5em;"><i class="fas fa-expand-arrows-alt"></i></div>' +
                    "</div>"
            );
        } else if (isStickyNote == "RightCross") {
            textBox = $(
                '<div id="' +
                    txId +
                    '" class="hotqcontent ' +
                    cssclass +
                    '" style="font-family: Monospace; position:absolute; top:' +
                    top +
                    "px; left:" +
                    left +
                    "px;" +
                    ';">' +
                    '<div contentEditable="false" spellcheck="false" class="" style="outline: none; font-size:' +
                    fontsize +
                    "em; color:" +
                    textcolor +
                    '; min-width:50px; min-height:50px"><img src="./images/RightCross.png" alt="Girl in a jacket" width="' +
                    fontsize * 50 +
                    '" height="' +
                    fontsize * 25 +
                    '"></div>' +
                    '<div title="remove textbox" class="removeIcon nested" style="position:absolute;  cursor:pointer; top:-4px; right:2px;">x</div>' +
                    '<div title="move textbox" class="moveIcon nested" style="position:absolute; cursor:move; top:1px; left:2px; font-size: 0.5em;"><i class="fas fa-expand-arrows-alt"></i></div>' +
                    "</div>"
            );
        }
        _this.latestActiveTextBoxId = txId;
        textBox.click(function (e) {
            e.preventDefault();
            _this.latestActiveTextBoxId = txId;
            return false;
        });
        textBox.on("mousemove touchmove", function (e) {
            e.preventDefault();
            if (_this.imgDragActive) {
                return;
            }
            var textBoxPosition = textBox.position();
            var currX = e.offsetX + textBoxPosition.left;
            var currY = e.offsetY + textBoxPosition.top;
            if ($(e.target).hasClass("removeIcon")) {
                currX += textBox.width() - 4;
            }

            const newPointerPosition = new Point(currX, currY);

            ThrottlingService.throttle(newPointerPosition, () => {
                _this.lastPointerPosition = newPointerPosition;
                _this.sendFunction({
                    t: "cursor",
                    event: "move",
                    d: [newPointerPosition.x, newPointerPosition.y],
                    username: _this.settings.username,
                });
            });
        });
        this.textContainer.append(textBox);
        textBox.draggable({
            handle: ".moveIcon",
            stop: function () {
                var textBoxPosition = textBox.position();
                _this.sendFunction({
                    t: "setTextboxPosition",
                    d: [txId, textBoxPosition.top, textBoxPosition.left],
                });
            },
            drag: function () {
                var textBoxPosition = textBox.position();
                _this.sendFunction({
                    t: "setTextboxPosition",
                    d: [txId, textBoxPosition.top, textBoxPosition.left],
                });
            },
        });
        textBox.find(".textContent").on("input", function () {
            var text = btoa(unescape(encodeURIComponent($(this).html()))); //Get html and make encode base64 also take care of the charset
            _this.sendFunction({ t: "setTextboxText", d: [txId, text] });
        });
        textBox
            .find(".removeIcon")
            .off("click")
            .click(function (e) {
                $("#" + txId).remove();
                _this.sendFunction({ t: "removeTextbox", d: [txId] });
                e.preventDefault();
                return false;
            });
        if (newLocalBox) {
            //per https://stackoverflow.com/questions/2388164/set-focus-on-div-contenteditable-element
            setTimeout(() => {
                textBox.find(".textContent").focus();
            }, 0);
        }
        if (
            this.tool === "text" ||
            this.tool === "stickynote" ||
            this.tool === "soccerPlayer" ||
            this.tool === "circleWithCross" ||
            this.tool === "Cross" ||
            this.tool === "CenterCross" ||
            this.tool === "RightCross" ||
            this.tool === "leftCross"
        ) {
            textBox.addClass("active");
        }

        // render newly added icons
        dom.i2svg();
    },
    setTextboxText(txId, text) {
        $("#" + txId)
            .find(".textContent")
            .html(decodeURIComponent(escape(atob(text)))); //Set decoded base64 as html
    },
    removeTextbox(txId) {
        $("#" + txId).remove();
    },
    setTextboxPosition(txId, top, left) {
        $("#" + txId).css({ top: top + "px", left: left + "px" });
    },
    setTextboxFontSize(txId, fontSize) {
        $("#" + txId)
            .find(".textContent")
            .css({ "font-size": fontSize + "em" });
    },
    setTextboxFontColor(txId, color) {
        $("#" + txId)
            .find(".textContent")
            .css({ color: color });
    },
    setTextboxBackgroundColor(txId, textboxBackgroundColor) {
        $("#" + txId)
            .find(".textContent")
            .css({ "background-color": textboxBackgroundColor });
    },
    drawImgToCanvas(url, width, height, left, top, rotationAngle, doneCallback) {
        top = Number(top); // probably not as important here
        left = Number(left); // as it is when generating html
        width = Number(width);
        height = Number(height);
        rotationAngle = Number(rotationAngle);

        var _this = this;
        var img = document.createElement("img");
        img.onload = function () {
            rotationAngle = rotationAngle ? rotationAngle : 0;
            if (rotationAngle === 0) {
                _this.ctx.drawImage(img, left, top, width, height);
            } else {
                _this.ctx.save();
                _this.ctx.translate(left + width / 2, top + height / 2);
                _this.ctx.rotate(rotationAngle);
                _this.ctx.drawImage(img, -(width / 2), -(height / 2), width, height);
                _this.ctx.restore();
            }
            if (doneCallback) {
                doneCallback();
            }
        };

        img.src = this.imgWithSrc(url).attr("src"); // or here - but consistent
    },
    undoWhiteboard: function (username) {
        //Not call this directly because you will get out of sync whit others...
        var _this = this;
        if (!username) {
            username = _this.settings.username;
        }
        for (var i = _this.drawBuffer.length - 1; i >= 0; i--) {
            if (_this.drawBuffer[i]["username"] == username) {
                var drawId = _this.drawBuffer[i]["drawId"];
                for (var i = _this.drawBuffer.length - 1; i >= 0; i--) {
                    if (
                        _this.drawBuffer[i]["drawId"] == drawId &&
                        _this.drawBuffer[i]["username"] == username
                    ) {
                        _this.undoBuffer.push(_this.drawBuffer[i]);
                        _this.drawBuffer.splice(i, 1);
                    }
                }
                break;
            }
        }
        if (_this.undoBuffer.length > 1000) {
            _this.undoBuffer.splice(0, _this.undoBuffer.length - 1000);
        }
        _this.canvas.height = _this.canvas.height;
        _this.imgContainer.empty();
        _this.loadDataInSteps(_this.drawBuffer, false, function (stepData) {
            //Nothing to do
        });
    },
    redoWhiteboard: function (username) {
        //Not call this directly because you will get out of sync whit others...
        var _this = this;
        if (!username) {
            username = _this.settings.username;
        }
        for (var i = _this.undoBuffer.length - 1; i >= 0; i--) {
            if (_this.undoBuffer[i]["username"] == username) {
                var drawId = _this.undoBuffer[i]["drawId"];
                for (var i = _this.undoBuffer.length - 1; i >= 0; i--) {
                    if (
                        _this.undoBuffer[i]["drawId"] == drawId &&
                        _this.undoBuffer[i]["username"] == username
                    ) {
                        _this.drawBuffer.push(_this.undoBuffer[i]);
                        _this.undoBuffer.splice(i, 1);
                    }
                }
                break;
            }
        }
        _this.canvas.height = _this.canvas.height;
        _this.imgContainer.empty();
        _this.loadDataInSteps(_this.drawBuffer, false, function (stepData) {
            //Nothing to do
        });
    },
    undoWhiteboardClick: function () {
        if (ReadOnlyService.readOnlyActive) return;
        this.sendFunction({ t: "undo" });
        this.undoWhiteboard();
    },
    redoWhiteboardClick: function () {
        if (ReadOnlyService.readOnlyActive) return;
        this.sendFunction({ t: "redo" });
        this.redoWhiteboard();
    },
    setTool: function (tool) {
        this.tool = tool;
        if (
            this.tool === "text" ||
            this.tool === "stickynote" ||
            this.tool === "soccerPlayer" ||
            this.tool === "circleWithCross" ||
            this.tool === "Cross" ||
            this.tool === "CenterCross" ||
            this.tool === "RightCross" ||
            this.tool === "leftCross"
        ) {
            $(".textBox").addClass("active");
            this.textContainer.appendTo($(whiteboardContainer)); //Bring textContainer to the front
        } else {
            $(".textBox").removeClass("active");
            this.mouseOverlay.appendTo($(whiteboardContainer));
        }
        this.refreshCursorAppearance();
        this.mouseOverlay.find(".xCanvasBtn").click();
        this.latestActiveTextBoxId = null;
    },
    setDrawColor(color) {
        var _this = this;
        _this.drawcolor = color;
        $("#whiteboardColorpicker").css({ background: color });
        if (
            (_this.tool == "text" ||
                this.tool === "stickynote" ||
                this.tool === "soccerPlayer" ||
                this.tool === "circleWithCross" ||
                this.tool === "Cross" ||
                this.tool === "CenterCross" ||
                this.tool === "RightCross" ||
                this.tool === "leftCross") &&
            _this.latestActiveTextBoxId
        ) {
            _this.sendFunction({
                t: "setTextboxFontColor",
                d: [_this.latestActiveTextBoxId, color],
            });
            _this.setTextboxFontColor(_this.latestActiveTextBoxId, color);
        }
    },
    setTextBackgroundColor(textboxBackgroundColor) {
        var _this = this;
        _this.textboxBackgroundColor = textboxBackgroundColor;
        $("#textboxBackgroundColorPicker").css({ background: textboxBackgroundColor });
        if (
            (_this.tool == "text" ||
                this.tool === "stickynote" ||
                this.tool === "soccerPlayer" ||
                this.tool === "circleWithCross" ||
                this.tool === "Cross" ||
                this.tool === "CenterCross" ||
                this.tool === "RightCross" ||
                this.tool === "leftCross") &&
            _this.latestActiveTextBoxId
        ) {
            _this.sendFunction({
                t: "setTextboxBackgroundColor",
                d: [_this.latestActiveTextBoxId, textboxBackgroundColor],
            });
            _this.setTextboxBackgroundColor(_this.latestActiveTextBoxId, textboxBackgroundColor);
        }
    },
    updateSmallestScreenResolution() {
        const { smallestScreenResolution } = InfoService;
        const { showSmallestScreenIndicator } = ConfigService;
        if (showSmallestScreenIndicator && smallestScreenResolution) {
            const { w: width, h: height } = smallestScreenResolution;
            this.backgroundGrid.empty();
            if (width < $(window).width() || height < $(window).height()) {
                this.backgroundGrid.append(
                    '<div style="position:absolute; left:0px; top:0px; border-right:3px dotted black; border-bottom:3px dotted black; width:' +
                        width +
                        "px; height:" +
                        height +
                        'px;"></div>'
                );
                this.backgroundGrid.append(
                    '<div style="position:absolute; left:' +
                        (width + 5) +
                        'px; top:0px;">smallest screen participating</div>'
                );
            }
        }
    },
    handleEventsAndData: function (content, isNewData, doneCallback) {
        var _this = this;
        var tool = content["t"];
        var data = content["d"];
        var color = content["c"];
        var username = content["username"];
        var thickness = content["th"];

        window.requestAnimationFrame(function () {
            if (tool === "line" || tool === "pen") {
                if (data.length == 4) {
                    //Only used for old json imports
                    _this.drawPenLine(data[0], data[1], data[2], data[3], color, thickness);
                } else {
                    _this.drawPenSmoothLine(data, color, thickness);
                }
            } else if (tool === "penArrow") {
                _this.drawPenSmoothLineArrow(data, color, thickness, 5, 5, true, false);
            } else if (tool === "penTab") {
                _this.drawPenSmoothLineTab(data, color, thickness, 5, 5, true, false);
            } else if (tool === "penDotted") {
                _this.drawPenSmoothLineDotted(data, color, thickness);
            } else if (tool === "penDottedArrow") {
                _this.drawPenSmoothLineDottedArrow(data, color, thickness);
            } else if (tool === "penDottedCircle") {
                _this.drawPenSmoothLineDottedCircle(data, color, thickness);
            } else if (tool === "penCircle") {
                _this.drawPenSmoothLineCircle(data, color, thickness);
            } else if (tool === "dotted") {
                _this.drawDotted(
                    data[0],
                    data[1],
                    data[2],
                    data[3],
                    color,
                    thickness,
                    thickness * 2,
                    thickness * 2
                );
            } else if (tool === "dottedArrow") {
                _this.drawDottedArrow(
                    data[0],
                    data[1],
                    data[2],
                    data[3],
                    color,
                    thickness,
                    thickness * 2,
                    thickness * 2,
                    5,
                    5,
                    true,
                    false
                );
            } else if (tool === "arrow") {
                _this.drawArrow(
                    data[0],
                    data[1],
                    data[2],
                    data[3],
                    color,
                    thickness,
                    5,
                    5,
                    true,
                    false
                );
            } else if (tool === "arrowTab") {
                _this.drawArrowTab(
                    data[0],
                    data[1],
                    data[2],
                    data[3],
                    color,
                    thickness,
                    5,
                    5,
                    true,
                    false
                );
            } else if (tool === "arrowDootedTab") {
                _this.drawArrowDootedTab(
                    data[0],
                    data[1],
                    data[2],
                    data[3],
                    color,
                    thickness,
                    5,
                    5,
                    true,
                    false
                );
            } else if (tool === "rect") {
                _this.drawRec(data[0], data[1], data[2], data[3], color, thickness);
            } else if (tool === "circle") {
                _this.drawCircle(data[0], data[1], data[2], color, thickness);
            } else if (tool === "circleFixed") {
                _this.drawCircleFixed(data[0], data[1], data[2], color, thickness);
            } else if (tool === "circleFilled") {
                _this.drawCircleFilled(data[0], data[1], data[2], color, thickness);
            } else if (tool === "eraser") {
                _this.drawEraserLine(data[0], data[1], data[2], data[3], thickness);
            } else if (tool === "eraseRec") {
                _this.eraseRec(data[0], data[1], data[2], data[3]);
            } else if (tool === "recSelect") {
                _this.dragCanvasRectContent(data[0], data[1], data[2], data[3], data[4], data[5]);
            } else if (tool === "addImgBG") {
                if (content["draw"] == "1") {
                    _this.drawImgToCanvas(
                        content["url"],
                        data[0],
                        data[1],
                        data[2],
                        data[3],
                        data[4],
                        doneCallback
                    );
                } else {
                    _this.drawImgToBackground(
                        content["url"],
                        data[0],
                        data[1],
                        data[2],
                        data[3],
                        data[4]
                    );
                }
            } else if (tool === "addTextBox") {
                _this.addTextBox(
                    data[0],
                    data[1],
                    data[2],
                    data[3],
                    data[4],
                    data[5],
                    data[6],
                    data[7]
                );
            } else if (tool === "setTextboxText") {
                _this.setTextboxText(data[0], data[1]);
            } else if (tool === "removeTextbox") {
                _this.removeTextbox(data[0]);
            } else if (tool === "setTextboxPosition") {
                _this.setTextboxPosition(data[0], data[1], data[2]);
            } else if (tool === "setTextboxFontSize") {
                _this.setTextboxFontSize(data[0], data[1]);
            } else if (tool === "setTextboxFontColor") {
                _this.setTextboxFontColor(data[0], data[1]);
            } else if (tool === "setTextboxBackgroundColor") {
                _this.setTextboxBackgroundColor(data[0], data[1]);
            } else if (tool === "clear") {
                _this.canvas.height = _this.canvas.height;
                _this.imgContainer.empty();
                _this.textContainer.empty();
                _this.drawBuffer = [];
                _this.undoBuffer = [];
                _this.drawId = 0;
            } else if (tool === "cursor" && _this.settings) {
                if (content["event"] === "move") {
                    if (_this.cursorContainer.find("." + content["username"]).length >= 1) {
                        _this.cursorContainer
                            .find("." + content["username"])
                            .css({ left: data[0] + "px", top: data[1] - 15 + "px" });
                    } else {
                        _this.cursorContainer.append(
                            '<div style="font-size:0.8em; padding-left:2px; padding-right:2px; background:gray; color:white; border-radius:3px; position:absolute; left:' +
                                data[0] +
                                "px; top:" +
                                (data[1] - 151) +
                                'px;" class="userbadge ' +
                                content["username"] +
                                '">' +
                                '<div style="width:4px; height:4px; background:gray; position:absolute; top:13px; left:-2px; border-radius:50%;"></div>' +
                                decodeURIComponent(atob(content["username"])) +
                                "</div>"
                        );
                    }
                } else {
                    _this.cursorContainer.find("." + content["username"]).remove();
                }
            } else if (tool === "undo") {
                _this.undoWhiteboard(username);
            } else if (tool === "redo") {
                _this.redoWhiteboard(username);
            }
        });

        if (
            isNewData &&
            [
                "line",
                "pen",
                "penArrow",
                "penTab",
                "penDotted",
                "penDottedArrow",
                "penDottedCircle",
                "penCircle",
                "rect",
                "arrow",
                "dotted",
                "dottedArrow",
                "arrowTab",
                "arrowDootedTab",
                "circle",
                "circleFixed",
                "circleFilled",
                "eraser",
                "addImgBG",
                "recSelect",
                "eraseRec",
                "addTextBox",
                "setTextboxText",
                "removeTextbox",
                "setTextboxPosition",
                "setTextboxFontSize",
                "setTextboxFontColor",
                "setTextboxBackgroundColor",
            ].includes(tool)
        ) {
            content["drawId"] = content["drawId"] ? content["drawId"] : _this.drawId;
            content["username"] = content["username"]
                ? content["username"]
                : _this.settings.username;
            _this.drawBuffer.push(content);
        }
    },
    userLeftWhiteboard(username) {
        this.cursorContainer.find("." + username).remove();
    },
    refreshUserBadges() {
        this.cursorContainer.find(".userbadge").remove();
    },
    getImageDataBase64(options, callback) {
        var _this = this;
        var width = this.mouseOverlay.width();
        var height = this.mouseOverlay.height();
        var copyCanvas = document.createElement("canvas");
        copyCanvas.width = width;
        copyCanvas.height = height;
        var imageFormat = options.imageFormat || "png";
        var drawBackgroundGrid = options.drawBackgroundGrid || false;

        // var brackGroundImg = new Image();
        // brackGroundImg.src = _this.settings.backgroundGridUrl;

        brackGroundImg.onload = function () {
            var destCtx = copyCanvas.getContext("2d"); //Draw the maincanvas to the exportcanvas

            if (imageFormat === "jpeg") {
                //Set white background for jpeg images
                destCtx.fillStyle = "#FFFFFF";
                destCtx.fillRect(0, 0, width, height);
            }

            if (drawBackgroundGrid) {
                destCtx.globalAlpha = 0.8;
                var ptrn = destCtx.createPattern(brackGroundImg, "repeat"); // Create a pattern with this image, and set it to "repeat".
                destCtx.fillStyle = ptrn;
                destCtx.fillRect(0, 0, copyCanvas.width, copyCanvas.height); // context.fillRect(x, y, width, height);
                destCtx.globalAlpha = 1;
            }

            $.each(_this.imgContainer.find("img"), function () {
                //Draw Backgroundimages to the export canvas
                var width = $(this).width();
                var height = $(this).height();
                var p = $(this).position();
                var left = Math.round(p.left * 100) / 100;
                var top = Math.round(p.top * 100) / 100;
                destCtx.drawImage(this, left, top, width, height);
            });

            //Copy drawings
            destCtx.drawImage(_this.canvas, 0, 0);

            var textBoxCnt = 0;
            $.each($(".textBox"), function () {
                //Draw the text on top
                textBoxCnt++;

                var textContainer = $(this);
                var p = textContainer.position();

                var left = Math.round(p.left * 100) / 100;
                var top = Math.round(p.top * 100) / 100;

                html2canvas(this, {
                    backgroundColor: "rgba(0, 0, 0, 0)",
                    removeContainer: true,
                }).then(function (canvas) {
                    destCtx.drawImage(canvas, left, top);
                    textBoxCnt--;
                    checkForReturn();
                });
            });

            function checkForReturn() {
                if (textBoxCnt == 0) {
                    var url = copyCanvas.toDataURL("image/" + imageFormat);
                    callback(url);
                }
            }
            checkForReturn();
        };
    },
    getImageDataJson() {
        var sendObj = [];
        for (var i = 0; i < this.drawBuffer.length; i++) {
            sendObj.push(JSON.parse(JSON.stringify(this.drawBuffer[i])));
            delete sendObj[i]["username"];
            delete sendObj[i]["wid"];
            delete sendObj[i]["drawId"];
        }
        return JSON.stringify(sendObj, null, 2);
    },
    loadData: function (content) {
        var _this = this;
        _this.loadDataInSteps(content, true, function (stepData) {
            if (
                stepData["username"] == _this.settings.username &&
                _this.drawId < stepData["drawId"]
            ) {
                _this.drawId = stepData["drawId"] + 1;
            }
        });
    },
    loadDataInSteps(content, isNewData, callAfterEveryStep) {
        var _this = this;

        function lData(index) {
            for (var i = index; i < content.length; i++) {
                if (content[i]["t"] === "addImgBG" && content[i]["draw"] == "1") {
                    _this.handleEventsAndData(content[i], isNewData, function () {
                        callAfterEveryStep(content[i], i);
                        lData(i + 1);
                    });
                    break;
                } else {
                    _this.handleEventsAndData(content[i], isNewData);
                    callAfterEveryStep(content[i], i);
                }
            }
        }
        lData(0);
    },
    loadJsonData(content, doneCallback) {
        var _this = this;
        _this.loadDataInSteps(content, false, function (stepData, index) {
            _this.sendFunction(stepData);
            if (index >= content.length - 1) {
                //Done with all data
                _this.drawId++;
                if (doneCallback) {
                    doneCallback();
                }
            }
        });
    },
    sendFunction: function (content) {
        //Sends every draw to server
        var _this = this;
        content["wid"] = _this.settings.whiteboardId;
        content["username"] = _this.settings.username;
        content["drawId"] = _this.drawId;

        var tool = content["t"];
        if (_this.settings.sendFunction) {
            _this.settings.sendFunction(content);
        }
        if (
            [
                "line",
                "pen",
                "penArrow",
                "penTab",
                "penDotted",
                "penDottedArrow",
                "penDottedCircle",
                "penCircle",
                "rect",
                "arrow",
                "dotted",
                "dottedArrow",
                "arrowTab",
                "arrowDootedTab",
                "circle",
                "circleFixed",
                "circleFilled",
                "eraser",
                "addImgBG",
                "recSelect",
                "eraseRec",
                "addTextBox",
                "setTextboxText",
                "removeTextbox",
                "setTextboxPosition",
                "setTextboxFontSize",
                "setTextboxFontColor",
                "setTextboxBackgroundColor",
            ].includes(tool)
        ) {
            _this.drawBuffer.push(content);
        }
    },
    refreshCursorAppearance() {
        //Set cursor depending on current active tool
        var _this = this;
        if (
            _this.tool === "pen" ||
            _this.tool === "eraser" ||
            _this.tool === "penDotted" ||
            _this.tool === "penArrow" ||
            _this.tool === "penTab" ||
            _this.tool === "penDottedArrow" ||
            _this.tool === "penDottedCircle" ||
            _this.tool === "penCircle"
        ) {
            _this.mouseOverlay.css({ cursor: "none" });
        } else if (_this.tool === "mouse") {
            this.mouseOverlay.css({ cursor: "default" });
        } else {
            //Line, Rec, Circle, Cutting
            _this.mouseOverlay.css({ cursor: "crosshair" });
        }
    },
};

function lanczosKernel(x) {
    if (x == 0) {
        return 1.0;
    }
    return (2 * Math.sin(Math.PI * x) * Math.sin((Math.PI * x) / 2)) / Math.pow(Math.PI * x, 2);
}

function lanczosInterpolate(xm1, ym1, x0, y0, x1, y1, x2, y2, a) {
    var cm1 = lanczosKernel(1 + a);
    var c0 = lanczosKernel(a);
    var c1 = lanczosKernel(1 - a);
    var c2 = lanczosKernel(2 - a);
    var delta = (cm1 + c0 + c1 + c2 - 1) / 4;
    cm1 -= delta;
    c0 -= delta;
    c1 -= delta;
    c2 -= delta;
    return [cm1 * xm1 + c0 * x0 + c1 * x1 + c2 * x2, cm1 * ym1 + c0 * y0 + c1 * y1 + c2 * y2];
}

function testImage(url, callback, timeout) {
    timeout = timeout || 5000;
    var timedOut = false,
        timer;
    var img = new Image();
    img.onerror = img.onabort = function () {
        if (!timedOut) {
            clearTimeout(timer);
            callback(false);
        }
    };
    img.onload = function () {
        if (!timedOut) {
            clearTimeout(timer);
            callback(true);
        }
    };
    img.src = url;
    timer = setTimeout(function () {
        timedOut = true;
        // reset .src to invalid URL so it stops previous
        // loading, but doesn't trigger new load
        img.src = "//!!!!/test.jpg";
        callback(false);
    }, timeout);
}

export default whiteboard;

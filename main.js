/** Constants and global variables. */
const PRODUCT_ID = 4097;
const VENDOR_ID = 12471;

const DATA = [];

const MAX_POINTS = 2000;
const MAX_VALUE = 100;
const TIME_WINDOW = 5000;
const WIDTH = 1500;
const HEIGHT = 350;

const MARGIN = {left: 0, right: 30, bottom: 20, top: 20};
const VIEW_HEIGHT = HEIGHT - MARGIN.top - MARGIN.bottom;
const VIEW_WIDTH = WIDTH - MARGIN.right - MARGIN.left;
const x = d3.scaleTime()
    .range([0, VIEW_WIDTH]);
const y = d3.scaleLinear()
    .domain([0, MAX_VALUE])
    .range([VIEW_HEIGHT, 0]);

const yAxis = d3.axisRight(y)
    .tickSizeInner(-VIEW_WIDTH)
    .tickSizeOuter(0)
    .tickPadding(4);

// const CURVE_TYPE = d3.curveLinear;
const CURVE_TYPE = d3.curveBasis;

const throttleLine = d3.line()
    .curve(CURVE_TYPE)
    .defined(p => !!p)
    .x((d) => x(d.x))
    .y((d) => y(d.throttle));
const brakeLine = d3.line()
    .curve(CURVE_TYPE)
    .defined(p => !!p)
    .x((d) => x(d.x))
    .y((d) => y(d.brake));

const graph = d3.select("#graph");

const TESTMODE = false;

/**
 * Visualization functions.
 * Modified from https://codepen.io/ReklatsMasters/pen/GOJwJv.
 */

function draw(selection) {
    const now = Date.now();
    x.domain([now - TIME_WINDOW, now]);
    selection.each(function(data) {
        const container = d3.select(this);

        const svg = container.selectAll("svg").data([data]);
        const gEnter = svg.enter().append("svg").append("g");

        svg
            .attr("width", WIDTH)
            .attr('height', HEIGHT);

        const pathLayer = gEnter
            .append("g")
            .attr("class", "path layer");
        pathLayer
            .append("path")
            .attr("class", "throttleline");
        pathLayer
            .append("path")
            .attr("class", "brakeline");

        gEnter
            .append('g')
            .attr('transform', `translate(${VIEW_WIDTH + MARGIN.left}, 0)`)
            .attr('class', 'y axis')
            .call(yAxis);

        const g = svg.select("g")
            .attr('transform', `translate(${MARGIN.left},${MARGIN.top})`);
        g.select("path.throttleline")
            .attr('d', throttleLine(data));
        g.select("path.brakeline")
            .attr('d', brakeLine(data));
        g.select('.y.axis')
            .call(yAxis)
            .selectAll('line')
            .attr('stroke-dasharray', 5);
    });
}

function pushDataPoint(brake, throttle) {
    DATA.push({
        x: new Date(),
        brake,
        throttle,
    });

    if (DATA.length > MAX_POINTS) {
        DATA.shift();
    }

    graph
        .datum(DATA)
        .call(draw);
}

/** Device interface functions. */
async function pairDevice() {
    const devices = await navigator.hid.requestDevice({filters: [{productId: PRODUCT_ID, vendorId: VENDOR_ID}]});
    return devices[0];
}

async function getPairedDevice() {
    const devices = await navigator.hid.getDevices();
    const validDevices = devices.filter((device) => {
        return device.productId === PRODUCT_ID && device.vendorId === VENDOR_ID;
    });

    if (validDevices.length > 0) {
        return validDevices[0];
    } else {
        return null;
    }
}

// Listens to updates from the pedals.
function inputReportListener(event) {
    const { data } = event;

    // Values range from 0-15.
    const brake = data.getUint8(3) / 0.15;
    const throttle = data.getUint8(1) / 0.15;

    pushDataPoint(brake, throttle);
}

/**
 * Functions for testing.
 */

function random(min, max) {
    return Math.floor(Math.random() * (max - min + 1) + min);
}

if (TESTMODE) {
    const intervalMs = 10;
    const speed = 5;
    const numSpikesLow = 10;
    const numSpikesHigh = 20;
    const spikeChance = 3e-3;

    let brake = random(0, 100);
    let throttle = random(0, 100);
    let brakeSpikeCounter = 0;
    let throttleSpikeCounter = 0;

    d3.interval(() => {
        if (brakeSpikeCounter === 0 && Math.random() < spikeChance) {
            brakeSpikeCounter += random(numSpikesLow, numSpikesHigh);
        }
        if (throttleSpikeCounter === 0 && Math.random() < spikeChance) {
            throttleSpikeCounter += random(numSpikesLow, numSpikesHigh);
        }
        if (brakeSpikeCounter > 0) {
            const lowValue = random(0, 20);
            const highValue = random(MAX_VALUE - 20, MAX_VALUE);
            brake = (brakeSpikeCounter-- % 2 === 0) ? lowValue : highValue;
        } else {
            brake = Math.min(MAX_VALUE, Math.max(0, brake + random(-speed, speed)));
        }
        if (throttleSpikeCounter > 0) {
            const lowValue = random(0, 20);
            const highValue = random(MAX_VALUE - 20, MAX_VALUE);
            throttle = throttleSpikeCounter-- % 2 === 0 ? lowValue : highValue;
        } else {
            throttle = Math.min(MAX_VALUE, Math.max(0, throttle + random(-speed, speed)));
        }
        pushDataPoint(brake, throttle);
    }, intervalMs);
}

d3.select("#pairbutton").node().onclick = async () => {
    // Find pedals.
    let device = await getPairedDevice();
    if (device === null) {
        device = await pairDevice();
    }

    if (device === null) {
        // Device pairing failed.
        return;
    }

    // Initialize event listener.
    device.addEventListener("inputreport", inputReportListener);

    // Open connection to pedals.
    await device.open();
};
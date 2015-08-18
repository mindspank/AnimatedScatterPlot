requirejs.config({
    paths: {
        "d3": "../extensions/animatedscatterplot/d3.min",
        "dragit": "../extensions/animatedscatterplot/dragit"
    },
    "shim": {
        "dragit": ["d3"]
    }
});

define(["jquery", "./d3.min", "text!./animatedscatterplot.css", "qvangular", "text!./dragit.js"], function ($, d3, css, qv, drag) {
    'use strict';
    $("<style>").html(css).appendTo("head");
    $("<script>").html(drag).appendTo("head");
    return {
        initialProperties: {
            version: 1.0,
			qHyperCubeDef: {
				qSuppressZero: true,
				qSuppressMissing: true
			}
        },
        definition: {
            type: "items",
            component: "accordion",
            items: {
                dimensions: {
                    uses: "dimensions",
                    min: 2,
                    max: 3
                },
                measures: {
                    uses: "measures",
                    min: 2,
                    max: 3
                },
                sorting: {
                    uses: "sorting"
                },
                settings: {
                    uses: "settings"
                }
            }
        },
        snapshot: {
            canTakeSnapshot: true
        },
        paint: function ($element, layout) {

            $element.empty();
            this.backendApi.cacheCube.enabled = false;
            
            //Can't be bothered to bind().
            var that = this;
            
            var timedimension = [];
            console.log(layout)
                                    
            // Dimensions
            var margin = {
                top: 19.5,
                right: 26,
                bottom: 19.5,
                left: 39.5
            };

            var minX = +layout.qHyperCube.qMeasureInfo[0].qMin;
            var maxX = +layout.qHyperCube.qMeasureInfo[0].qMax;
            var minY = +layout.qHyperCube.qMeasureInfo[1].qMin;
            var maxY = +layout.qHyperCube.qMeasureInfo[1].qMax;

            var width = $element.width() - margin.right - margin.left;
            var height = ($element.height() - 40) - margin.top - margin.bottom;
            
            // Color dimension and size measure
            var useColor = layout.qHyperCube.qDimensionInfo.length === 3 ? true : false;
            var useSize = layout.qHyperCube.qMeasureInfo.length === 3 ? true : false;
            
            // Scales
            var xScale = d3.scale.linear().domain([minX, maxX]).range([0, width]);
            var yScale = d3.scale.linear().domain([minY, maxY]).range([height, 0]);
            var colorScale = d3.scale.category10();
            
            // Radius - Controlled by optional measure.
            var radiusScale = function () { return 5 };

            if (useSize) {
                var sizeMin = +layout.qHyperCube.qMeasureInfo[2].qMin;
                var sizeMax = +layout.qHyperCube.qMeasureInfo[2].qMax;
                radiusScale = d3.scale.sqrt().domain([sizeMin, sizeMax]).range([5, 40]);
            };
              
            // Axes
            var xAxis = d3.svg.axis().orient('bottom').scale(xScale);
            var yAxis = d3.svg.axis().scale(yScale).orient('left');
            
            // Container
            var svg = d3.select($element.get(0)).append('svg')
                .attr('class', 'animatedscatter')
                .attr('width', width + margin.left + margin.right)
                .attr('height', height + margin.top + margin.bottom)
                .append('g')
                .attr('transform', 'translate(' + margin.left + ',' + margin.top + ')')
                .attr("class", "gRoot");
 
            // Add the country label; the value is set on transition.
            var countrylabel = svg.append("text")
                .attr("class", "country label")
                .attr("text-anchor", "start")
                .attr("y", 80)
                .attr("x", 20)
                .text(" ");
                
            // Add an x-axis label.
            svg.append("text")
                .attr("class", "x label")
                .attr("text-anchor", "end")
                .attr("x", width)
                .attr("y", height - 6)
                .text(layout.qHyperCube.qMeasureInfo[0].qFallbackTitle);
            
            // Add a y-axis label.
            svg.append("text")
                .attr("class", "y label")
                .attr("text-anchor", "end")
                .attr("y", 6)
                .attr("dy", ".75em")
                .attr("transform", "rotate(-90)")
                .text(layout.qHyperCube.qMeasureInfo[1].qFallbackTitle);
                
                console.log(layout);

            // Add the axes (plural?)
            svg.append('g')
                .attr('class', 'x axis')
                .attr('transform', 'translate(0,' + height + ')')
                .call(xAxis);

            svg.append('g')
                .attr('class', 'y axis')
                .call(yAxis);

            var label = svg.append('text')
                .attr('class', 'label')
                .attr('text-anchor', 'end')
                .attr('y', height - 24)
                .attr('x', width)
                .text(layout.qHyperCube.qDataPages[0].qMatrix[0][1].qText);

            var columns = layout.qHyperCube.qSize.qcx, totalheight = layout.qHyperCube.qSize.qcy;
            var pageheight = Math.floor(10000 / columns);

            var Promise = qv.getService('$q');

            var promises = Array.apply(null, Array(Math.ceil(totalheight / pageheight))).map(function (data, index) {
                var page = {
                    qTop: (pageheight * index) + index,
                    qLeft: 0,
                    qWidth: columns,
                    qHeight: pageheight
                };

                return this.backendApi.getData([page]);

            }, this)

            Promise.all(promises).then(function (data) {
                render(transformData(data));
            });


            function render(data) {

                function x(d) { return +d.x; }
                function y(d) { return +d.y; }
                function radius(d) { return +d.size; }
                function color(d) { return d.cat; }
                function key(d) { return d.name; }
                function timedim(d) { return d.time; }
                
                var randomId = 'slider' + Math.floor(Math.random() * 100);
                var dom = [
                    '<fieldset class="animatedset"><label for="' + randomId +  '">' + timedimension[0] + '</label>',
                    '<input type="range" max="' + (layout.qHyperCube.qDimensionInfo[1].qCardinal - 1) + '" min="0" step="1" value="0" id="' + randomId +  '" name="'+ randomId +'"</input>',
                    '<em id="rangeValLabel" style="font-style: normal;"></em>',
                    '</fieldset>'
                ].join('\n');
                
                $element.append(dom);
                
                $('#' + randomId).css({
                    width: $element.width() - 40 + 'px',
                })
                .addClass('rangeslider')
                .on('input', function(e) {
                    displayYear(timedimension[this.value])
                })         
                                                
                var minTime = d3.min(data[0].time);
                var bisect = d3.bisector(function (d) { return d[0]; });
                
                var dot = svg.append("g")
                    .attr("class", "dots")
                    .selectAll(".dot")
                    .data(interpolateData(minTime))
                    .enter().append("circle")
                    .attr("class", "dot")
                    .style("fill", function (d) { return colorScale(color(d)); })
                    .call(position)
                    .sort(order)
                    .on('mousedown', function() {
                        return;
                    })
                    .on("mouseenter", function(d, i) {
                        dragit.trajectory.display(d, d.idx)
                        countrylabel.text(d.name);
                        dot.style("opacity", .4)
                        d3.select(this).style("opacity", 1)
                        d3.selectAll(".selected").style("opacity", 1)
                    })
                    .on('click', function(d) {
                        d3.select(this).classed("selected", !d3.select(this).classed("selected"));
                        that.selectValues(0, [+d.elem], true);
                    })
                    .on("mouseleave", function(d, i) {
                        console.log('mouseleave')
                        countrylabel.text("");
                        dot.style("opacity", 1);
                        dragit.statemachine.setState('idle');
                        dragit.trajectory.remove(d, d.idx);
                    })
                    .call(dragit.object.activate);

                // Add a title.
                dot.append("title").text(function (d) { return d.name; });
                        
                function position(dot) {
                    dot.attr("cx", function (d) { return xScale(x(d)); })
                        .attr("cy", function (d) { return yScale(y(d)); })
                        .attr("r", function (d) { return radiusScale(radius(d)); });
                };

                // Defines a sort order so that the smallest dots are drawn on top.
                function order(a, b) {
                    return radius(b) - radius(a);
                };
                
                 function displayYear(time) {
                    dot.data(interpolateData(time), key).call(position).sort(order);
                    label.text(time);
                };
                
                function interpolateData(year) {
                    return data.map(function (d, i) {
                        var obj = {
                            name: d.name,
                            idx: i,
                            elem: d.elem,
                            cat: d.cat,
                            x: interpolateValues(d.x, year),
                            y: interpolateValues(d.y, year),
                            size: 5                       
                        };
                        
                        if( useSize ) {
                            obj.size = interpolateValues(d.size, year)
                        };
                        
                        return obj;
                    });
                }

                function interpolateValues(values, year) {
                    var i = bisect.left(values, year, 0, values.length - 1),
                        a = values[i];
                    if (i > 0) {
                        var b = values[i - 1],
                            t = (year - a[0]) / (b[0] - a[0]);
                        return a[1] * (1 - t) + b[1] * t;
                    }
                    return a[1];
                };
                                                
                function init() {
                
                    dragit.init(".gRoot");
                
                    dragit.time = {min:timedimension[0], max: timedimension[timedimension.length-1], step:1, current:timedimension[0]}
                    dragit.data = d3.range(data.length).map(function() { return Array(); })
                                
                    for(var yy = timedimension[0]; yy < timedimension[timedimension.length-1]; yy++) {
                        interpolateData(yy).filter(function(d, i) {
                            dragit.data[i][yy-dragit.time.min] = [xScale(x(d)), yScale(y(d))];
                        });
                    };
                                                    
                };
                
                init();                
                 
            };

            function transformData(layout) {
                
                var data = [];
                layout.forEach(function(d) {
                    d[0].qMatrix.forEach(function(e) {
                        data.push(e);
                        if( timedimension.indexOf(e[1].qText) == -1 ) {
                            timedimension.push(e[1].qText);
                        }
                    });
                });
                layout = null;

                var jsonData = [];
                var prevDimension = '';
                var counter = -1;

                for (var i = 0; i < data.length; i++)
                {
                    var time = data[i][1].qText;
                    var dimension = data[i][0].qText;
                    var colorCategory = 1;
                    var x = data[i][2].qNum;
                    var y = data[i][3].qNum;
                    var size, sizeArray = [], qelem = data[i][0].qElemNumber;
                    
                    if( useColor ) {
                        colorCategory = data[i][2].qText;
                        x = data[i][3].qNum
                        y = data[i][4].qNum
                    }
                    
                    if( useSize && !useColor ) {
                       size = data[i][4].qNum; 
                       sizeArray.push(time);
                       sizeArray.push(size);
                    }
                    if( useSize && useColor ) {
                       size = data[i][5].qNum; 
                       sizeArray.push(time);
                       sizeArray.push(size);
                    }
                                 
                    var xArray = [];
                    xArray.push(time);
                    xArray.push(x);

                    var yArray = [];
                    yArray.push(time);
                    yArray.push(y);
                    if (prevDimension != dimension) {
                        // Create a new node
                        counter++;
                        jsonData[counter] = { name: dimension, elem: qelem, cat: colorCategory, time: [], x: [], y: [] };
                        jsonData[counter].time[0] = time;
                        jsonData[counter].x[0] = xArray;
                        
                        jsonData[counter].y[0] = yArray;
                        
                        if( useSize ) {
                            jsonData[counter].size = [];
                            jsonData[counter].size[0] = sizeArray;
                        }
                        
                    }
                    else {
                        // Collect Measures and add to current node
                        jsonData[counter].time.push(time).qText;
                        jsonData[counter].x.push(xArray);
                        jsonData[counter].y.push(yArray);
                        
                        if( useSize ) {
                            jsonData[counter].size.push(sizeArray);
                        }
                        
                    }
                    prevDimension = dimension;
                }
                
                return jsonData;

            };


        }
    };
});
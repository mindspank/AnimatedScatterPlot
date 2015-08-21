define(["jquery", "./d3.min", "text!./animatedscatterplot.css", "qvangular"], function ($, d3, css, qv) {
    'use strict';
    $("<style>").html(css).appendTo("head");
    return {
        initialProperties: {
            version: 1,
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
                addons: {
                    uses: "addons",
                    items: {
                        dataHandling: {
                            uses: "dataHandling"
                        }
                    }
                },
                settings: {
                    uses: "settings",
                    items: {
                        animation: {
                            type: "items",
                            label: "Animation",
                            items: {
                                useduration: {
                                    label: "Use custom duration",
                                    type: "boolean",
                                    component: "switch",
                                    options: [{
                                        label: "Disabled",
                                        value: false
                                    }, {
                                        label: "Enabled",
                                        value: true
                                        }],
                                    ref: "animatedscatterplot.useduration",
                                    defaultValue: false 
                                },
                                duration: {
                                    ref: "animatedscatterplot.duration",
                                    label: "Duration (ms) per step",
                                    type: "number",
                                    expression: "optional",
                                    defaultValue: "0",
                                    show: function (d) {
                                        return d.animatedscatterplot.useduration;
                                    }
                                }
                            }                            
                        }
                    }
                }
            }
        },
        snapshot: {
            canTakeSnapshot: true
        },
        paint: function ($element, layout) {

            $element.empty();
            this.backendApi.cacheCube.enabled = false;
            
            $('<button class="g-play-button">Play</button>').appendTo($element);
             
            //Can't be bothered to bind().
            var that = this;
            
            var timedimension = [];
            var dot;
            
            function x(d) { return +d.x; };
            function y(d) { return +d.y; };
            function radius(d) { return +d.size; };
            function color(d) { return d.cat; };
            function key(d) { return d.name; };
            function timedim(d) { return d.time; };
            var bisect = d3.bisector(function (d) { return d[0]; });
            
            //Slider stuff
            var slider, handle, brushHeight = 40, playing = false, $play = $element.find('button'), currentValue, value; 
         
                                    
            // Dimensions
            var margin = {
                top: 10,
                right: 25,
                bottom: 50,
                left: 40
            };
                        
            var minX = +layout.qHyperCube.qMeasureInfo[0].qMin;
            var maxX = +layout.qHyperCube.qMeasureInfo[0].qMax;
            var minY = +layout.qHyperCube.qMeasureInfo[1].qMin;
            var maxY = +layout.qHyperCube.qMeasureInfo[1].qMax;

            var width = $element.width() - margin.right - margin.left;
            var height = ($element.height() - brushHeight) - margin.top - margin.bottom;
            
            // Color dimension and size measure
            var useColor = layout.qHyperCube.qDimensionInfo.length === 3 ? true : false;
            var useSize = layout.qHyperCube.qMeasureInfo.length === 3 ? true : false;
            
            
            // Scales
            var xScale = d3.scale.linear().domain([minX, maxX]).range([0, width]);
            var yScale = d3.scale.linear().domain([minY, maxY]).range([height, 0]);
            var colorScale = d3.scale.category10();
            
            // Radius - Controlled by optional measure.
            var sizeMin, sizeMax, radiusScale = function () { return 5 };

            if (useSize) {
                sizeMin = +layout.qHyperCube.qMeasureInfo[2].qMin;
                sizeMax = +layout.qHyperCube.qMeasureInfo[2].qMax;
                radiusScale = d3.scale.sqrt().domain([sizeMin, sizeMax]).range([5, 40]);
            };
              
            // Axes
            var xAxis = d3.svg.axis().orient('bottom').scale(xScale);
            var yAxis = d3.svg.axis().scale(yScale).orient('left');
            
            // Slider
            var svgSlider = d3.select($element.get(0)).append('svg')
                .attr('class', 'animatedscatter')
                .attr('width', width + margin.left + margin.right)
                .attr('height', 60)
              .append('g')
                .attr('transform', 'translate(110,5)');
            
            // Container
            var svg = d3.select($element.get(0)).append('svg')
                .attr('class', 'animatedscatter')
                .attr('width', width + margin.left + margin.right)
                .attr('height', height + margin.top + margin.bottom);
                
            var gRoot = svg.append('g')
                .attr('transform', 'translate(' + margin.left + ',' + margin.top + ')')
                .attr("class", "gRoot");
                
            // Add an x-axis label.
            gRoot.append("text")
                .attr("class", "x label")
                .attr("text-anchor", "end")
                .attr("x", width)
                .attr("y", height - 6)
                .text(layout.qHyperCube.qMeasureInfo[0].qFallbackTitle);
            
            // Add a y-axis label.
            gRoot.append("text")
                .attr("class", "y label")
                .attr("text-anchor", "end")
                .attr("y", 6)
                .attr("dy", ".75em")
                .attr("transform", "rotate(-90)")
                .text(layout.qHyperCube.qMeasureInfo[1].qFallbackTitle);
            
            // Time label
            var label = gRoot.append('text')
                .attr('class', 'label')
                .attr('text-anchor', 'end')
                .attr('y', height - 24)
                .attr('x', width)
                .text('');               

            // Add the axes (plural?)
            gRoot.append('g')
                .attr('class', 'x axis')
                .attr('transform', 'translate(0,' + height + ')')
                .call(xAxis);

            gRoot.append('g').attr('class', 'y axis').call(yAxis);
            
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

                label.text(timedimension[0])

                dot = gRoot.append("g")
                    .attr("class", "dots")
                    .selectAll(".dot")
                    .data(interpolateData(timedimension[0]))
                    .enter().append("circle")
                    .attr("class", "dot")
                    .style("cursor", "pointer")
                    .style("fill", function (d) { return colorScale(color(d)); })
                    .on('mousedown', function() {
                        return;
                    })
                    .on('click', function(d) {
                        d3.select(this).classed("selected", !d3.select(this).classed("selected"));
                        that.selectValues(0, [+d.elem], true);
                    });
                                                              
                var xSlideScale = d3.scale.linear()
                    .range([0, width - 100])
                    .domain([timedimension[0], timedimension[timedimension.length-1]])
                    .clamp(true);
                                
                var brush = d3.svg.brush()
                    .x(xSlideScale)
                    .extent([timedimension[0], timedimension[0]])
                    .on("brush", brushed);
                
                svgSlider.append("g")
                    .attr("class", "g-x g-axis")
                    .attr("transform", "translate(0," + brushHeight / 2 + ")")
                    .call(d3.svg.axis() 
                        .scale(xSlideScale)
                        .orient('bottom')
                        .tickFormat(d3.format(""))
                        .tickSize(0)
                        .tickPadding(12))
                    .select('.domain')
                    .select(function() { return this.parentNode.appendChild(this.cloneNode(true)); } )
                        .attr('class', 'g-halo')
                  
                slider = svgSlider.append('g')
                    .attr('class', 'g-slider')
                    .call(brush);
                    
                slider.selectAll('.extent,.resize').remove();
                slider.select('.background').attr('height', brushHeight);
                
                handle = slider.append('circle')
                    .attr('class', 'g-handle')
                    .attr('transform', 'translate(0,' + brushHeight / 2 + ')')
                    .attr('r', 9);
                    
                slider
                    .call(brush.event)
                    .call(brush.extent( [timedimension[0],timedimension[0]]) )
                    .call(brush.event);

                function brushed() {
                  if( d3.event.sourceEvent ) {
                      
                     value = xSlideScale.invert(d3.mouse(this)[0]);
                     currentValue = parseInt(value);
                      
                     brush.extent[currentValue,currentValue];
                     label.text(currentValue)
                     handle.attr('cx', xSlideScale(currentValue));
                     dot.data(interpolateData(currentValue), key).call(position).sort(order);                      
                  
                  } else {
                  
                    if( currentValue == timedimension[timedimension.length-1] ) {
                        $play.text('Play');
                    };
                  
                    value = brush.extent()[0];
                    currentValue = parseInt(value);
 
                    brush.extent[currentValue,currentValue];
                    label.text(currentValue)
                    handle.attr('cx', xSlideScale(currentValue));
                    dot.data(interpolateData(currentValue), key).call(position).sort(order);                   
                    
                      
                  }                    
                };
                        
                function position(dot) {
                    dot.transition().duration(400).ease('linear')
                        .attr("cx", function (d) { return xScale(x(d)); })
                        .attr("cy", function (d) { return yScale(y(d)); })
                        .attr("r", function (d) { return radiusScale(radius(d)); });
                };
                
                // Startes transition
                function play() {
                    var maxValue = +timedimension[timedimension.length-1];
                    if (currentValue == maxValue) {
                        slider.interrupt();
                        dot.interrupt();                        
                        playing = false;
                        
                        slider.call(brush.extent([currentValue = timedimension[0], currentValue])).call(brush.event);
                           
                        play();
                        return;
                    };
                    
                    if (!playing) {

                        $play.text('Pause');
                        playing = true;

                        var timer;
                        if( layout.animatedscatterplot.useduration ) {
                            timer = layout.animatedscatterplot.duration * (maxValue - timedimension[0]);
                        } else {
                            timer = (maxValue - currentValue) / (maxValue - timedimension[0]) * 10000;
                        };
                        
                        slider.transition()
                            .duration(timer)
                            .ease('linear')
                            .call(brush.extent([maxValue,maxValue]))
                            .call(brush.event);
                        
                    } else {
                        $play.text('Play');
                        playing = false;
                        slider.interrupt();
                        dot.interrupt();
                    };
                };
                
                $play.on('click', play);

                // Defines a sort order so that the smallest dots are drawn on top.
                function order(a, b) {
                    return radius(b) - radius(a);
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
                };

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
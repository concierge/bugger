let select = (obj) => {
    let date = new Date(),
        month = date.getMonth() + 1,
        year = (date.getFullYear() % 100).toString();

    let searchArray;
    if (month > 8) {
        searchArray = [year + 'S2', year + 'W'];
    } else {
        searchArray = [year + 'S1'];
    }

    let courses = {};
    for (let k in obj) {
        if (!obj.hasOwnProperty(k)) {
            continue;
        }

        for (let i = 0; i < searchArray.length; i++) {
            if (k.indexOf(searchArray[i]) >= 0) {
                courses[k] = obj[k];
                break;
            }
        }
    }
    return courses;
};

module.exports = select;

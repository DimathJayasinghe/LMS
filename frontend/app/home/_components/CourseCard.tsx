import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { faClock } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import Image from "next/image";

export default function CourseCard() {
    return <div
        data-name="course-card"
        className="w-[30%] relative rounded-2xl hover:shadow-xl  bg-white h-full border-gray-100 border overflow-hidden hover:border-gray-400 flex flex-col justify-between"
    >
        <Image src={"/Courses/1.png"} alt="course-1" width={800} height={800} className="w-[95%] h-60 object-cover m-auto mt-2 rounded-2xl" />

        <div
            data-name="year"
            className="absolute p-5 bg-teal-600  text-white font-bold w-40 h-20"
            style={{
                clipPath: "polygon(30% 0 , 100%  0 , 0 100% , 0  30%)",
            }}
        >
            <span
                data-name="year-transform"
                className="block -rotate-25 -translate-y-3 -translate-x-3"
            >
                2027 A/L
            </span>

        </div>

        <div
            data-name="course-name"
            className="m-2 font-medium text-lg"
        >
            Advance Level Physics Class 2027 ABC
        </div>

        <div className="flex items-center">
            <FontAwesomeIcon icon={faClock} className="w-5 m-2 text-gray-400" />
            <div className="text-gray-600 text-sm">Monday - 3.00PM to 5.00PM </div>
        </div>

        {/* <hr /> */}

        {/* <div data-name="teacher-details"
            className="flex gap-1 items-center"
        >
            <Avatar className="w-10 h-10 m-2">
                <AvatarImage
                    src="https://github.com/shadcn.png"
                    alt="@shadcn"
                    className="grayscale"
                />
                <AvatarFallback>CN</AvatarFallback>
            </Avatar>

            <div className="text-sm">
                <div>Teacher</div>
                <div>
                    Dr.Dharshana Ukuwela
                </div>
            </div>
        </div> */}




        <a
            href="#"
            className="w-[95%] m-2 bg-white hover:bg-black border border-gray-300 text-black duration-100 hover:text-white p-2 inline-block text-center rounded-2xl mt-10"
        >
            View Class
        </a>

    </div>
}
import Nav from "@/components/custom/Nav";
import Grid from "./_components/Grid";
import StudentReviews from "./_components/StudentRevies";
import Header from "./_components/Header";
import CourseCard from "./_components/CourseCard";
import Footer from "@/components/custom/Footer";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowAltCircleRight, faArrowRight, faStar } from "@fortawesome/free-solid-svg-icons";
import styled from "styled-components";

type BoxProps = {
    top: number;
    left: number;
};

const Box = styled.div<BoxProps>`
    width: 3rem;
    height : 3rem;
    position: absolute;
    animation : pop 1s ease infinite;
    top : ${props=>props.top}px;
    left : ${props=>props.left}px;

    @keyframes pop{
        0%{
            opacity : 0;
        }

        50%{
            opacity : 1;
        }

        100%{
            opacity : 0;
        }
    }
`



export default function home() {
    return <>
        <main>
            <Grid />
            <Nav />
            <StudentReviews />
            <Header />
        </main>

        <section className="bg-gray-50 border-t border-gray-50 mt-60 min-h-400 z-40 p-10 pt-40">
            <h1 className="text-gray-700 text-center text-5xl font-medium">Discover Classes</h1>
            <p className="text-center max-w-200 leading-7 m-auto mt-4 italic">Find the best classes you want to join based on your interests, career goals, and skills you want to improve. Choose classes that are useful, engaging, and helpful for your future development.</p>

            <div
                data-name="cards-container"
                className=" w-full flex flex-wrap gap-10 justify-center max-w-300 m-auto mt-10 "
            >
                
                {Array.from(new Array(9)).map((_ ,i)=><CourseCard key={i} />)}

            </div>

            <a
                href="#"
                data-name="button-discover-more-classes"
                className="bg-black flex m-auto mt-10 mb-10 text-white items-center gap-3 p-5 pl-10 pr-10 rounded-full w-fit text-lg relative hover:scale-110 ease-initial duration-300"
            >
                All classes
                <FontAwesomeIcon icon={faArrowRight} className="text-white w-5" />
            </a>


        </section>

        <Footer />

    </>
}